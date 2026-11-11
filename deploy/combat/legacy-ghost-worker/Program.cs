using System.Collections.Immutable;
using System.Text.Json;
using MonsterLifeEventsApp;
using MonsterLifeEventsApp.Combat;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var roster = new Roster();
var presence = new Dictionary<string, OwnedMonsterOwnerPresence>(StringComparer.Ordinal);
var world = new OwnedMonsterWorldSource(roster, id => presence.GetValueOrDefault(id), _ => null,
    combatEnabled: () => false);
var skillSource = new GhostSkillSource(world, roster);
// Node creates each request ID once and closes the pipe after its five-second timeout.
var runtime = new OwnedMonsterControlRuntime(skillSource, TimeSpan.FromSeconds(15));

while (Console.ReadLine() is { } line)
{
    if (line.Length > 8192) return;
    try
    {
        var input = JsonSerializer.Deserialize<Request>(line, json) ?? throw new ArgumentException();
        Console.WriteLine(JsonSerializer.Serialize(Handle(input), json));
    }
    catch (Exception error) when (error is JsonException or ArgumentException or InvalidOperationException)
    {
        Console.WriteLine("""{"accepted":false,"code":"GHOST_WORKER_INVALID_REQUEST"}""");
    }
}

object Handle(Request input)
{
    if (string.IsNullOrWhiteSpace(input.Owner)) throw new ArgumentException();
    if (input.Disconnect)
    {
        world.Disconnect(input.Owner);
        runtime.ForgetOwner(input.Owner);
        presence.Remove(input.Owner);
        roster.Remove(input.Owner);
        return new { accepted = true, code = "GHOST_DISCONNECTED" };
    }

    var command = input.Command ?? throw new ArgumentException();
    if (command.Kind is not ("summon" or "recall" or "switch" or "skill") ||
        input.Party is not { Length: >= 1 and <= 3 } party || input.Position is not { } position ||
        !double.IsFinite(position.X) || !double.IsFinite(position.Y) || !double.IsFinite(position.Z) ||
        string.IsNullOrWhiteSpace(command.Zone) ||
        party.Any(ghost => ghost is null || ghost.Slot is < 0 or > 2 ||
            string.IsNullOrWhiteSpace(ghost.InstanceId) || string.IsNullOrWhiteSpace(ghost.SpeciesId) ||
            ghost.Level is < 1 or > PocketMonsterCombatCalculator.MaxLevel) ||
        party.Select(ghost => ghost.Slot).Distinct().Count() != party.Length ||
        party.Select(ghost => ghost.InstanceId).Distinct().Count() != party.Length)
        throw new ArgumentException();

    var now = DateTime.UtcNow;
    presence[input.Owner] = new(command.Zone, position, now);
    roster.Set(input.Owner, party);
    world.RefreshParty(input.Owner);
    if (command.Kind == "skill")
    {
        var (cast, strike) = skillSource.Cast(runtime, input.Owner, command, input.Skill ?? throw new ArgumentException(), now);
        return new { cast.Accepted, cast.Code, cast.Replay, skill = strike };
    }
    var result = runtime.Handle(input.Owner, command, now);
    var active = world.CaptureOwnedActors(command.Zone, now)
        .SingleOrDefault(actor => actor.OwnerId == input.Owner);
    var monster = result.Monster;
    var definition = monster is null ? null : roster.ReadParty(input.Owner)
        .SingleOrDefault(ghost => ghost.InstanceId == monster.InstanceId);
    var stats = definition?.Profile.Stats;
    return new { result.Accepted, result.Code, result.Replay, active = active is null || stats is null ? null : new
        { active.ActorId, monster!.InstanceId, active.Generation, active.Pose.X, active.Pose.Y, active.Pose.Z,
            hpScale = stats.HpMax / Roster.BaseStats.HpMax, defenseScale = stats.Def / Roster.BaseStats.Def,
            magicDefenseScale = stats.SpDef / Roster.BaseStats.SpDef, attackScale = stats.Atk / Roster.BaseStats.Atk,
            basicRange = Roster.BasicAttack.Range, basicCooldownMs = Roster.BasicAttack.CooldownSeconds * 1000,
            skills = definition!.Actions.Select(action => new { skillId = action.ActionId, action.Range, action.MaxUses,
                cooldownMs = action.CooldownSeconds * 1000 }) } };
}

sealed record Ghost(string InstanceId, string SpeciesId, int Level, int Slot);
sealed record Request(string Owner, OwnedMonsterPoint? Position, Ghost[]? Party, OwnedMonsterCommand? Command,
    bool Disconnect, GhostSkillFrame? Skill);

sealed class Roster : IOwnedMonsterCanonicalReader
{
    // The normal owned basic attack from Pocket Monster's AccountService.OwnedMonsterCanonical.
    public static CombatActionDefinition BasicAttack { get; } =
        new CombatActionDefinition("basic_attack", "owned-basic-ai/v1", 1.35, 0, CombatAttackChannel.Physical,
            CombatActionTargetKind.NearestEnemy, CombatElementType.Normal, 15, 100, 1, true, true, 0,
            false, 1_000_000, .9, CentralCombatVersions.Rules, []).Validate();
    private static readonly (int Level, CombatActionDefinition Action)[] Skills = LoadSkills();
    public static CombatStats BaseStats { get; } = CalculateProfile("montra-ghost-baseline", 1).Stats;
    private readonly Dictionary<string, OwnedMonsterDefinition[]> definitions = new(StringComparer.Ordinal);

    public IReadOnlyList<OwnedMonsterDefinition> ReadParty(string ownerId) =>
        definitions.GetValueOrDefault(ownerId) ?? [];

    public void Remove(string ownerId) => definitions.Remove(ownerId);

    public void Set(string ownerId, Ghost[] party)
    {
        var previous = ReadParty(ownerId);
        definitions[ownerId] = party.Select(ghost => previous.FirstOrDefault(current =>
            current.InstanceId == ghost.InstanceId && current.SpeciesId == ghost.SpeciesId &&
            current.Profile.Level == ghost.Level && current.PartySlot == ghost.Slot) ?? Create(ownerId, ghost)).ToArray();
    }

    private static OwnedMonsterDefinition Create(string ownerId, Ghost ghost) =>
        new(ghost.InstanceId, ownerId, ghost.SpeciesId, CalculateProfile(ghost.InstanceId, ghost.Level),
            Skills.Where(skill => skill.Level <= ghost.Level).Select(skill => skill.Action).ToImmutableArray(),
            ghost.Slot, BasicAttack: BasicAttack);

    private static (int Level, CombatActionDefinition Action)[] LoadSkills()
    {
        var catalog = CombatActionCatalogProviderV91.LoadEmbedded();
        var assembly = typeof(Roster).Assembly;
        var resource = assembly.GetManifestResourceNames().Single(name => name.EndsWith("catalog-seed-v8.4.0.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var document = JsonDocument.Parse(stream);
        var learnset = document.RootElement.GetProperty("resources").GetProperty("learnsets").EnumerateArray()
            .Select(row => row.GetProperty("definition"))
            .Where(row => row.GetProperty("monsterId").GetString() == "MON_001")
            .ToArray();
        // These starter actions have a single target and no Pocket-only status effect.
        return new[] { "SK_NORMAL_01", "SK_NORMAL_02" }.Select(id => (
            learnset.Single(row => row.GetProperty("skillId").GetString() == id).GetProperty("learnLevel").GetInt32(),
            catalog.GetRequired(id).Definition)).ToArray();
    }

    private static BaseCombatProfile CalculateProfile(string instanceId, int level) =>
        PocketMonsterCombatCalculator.Calculate(new PocketMonsterCombatInput(
            instanceId, "pocket-monster", ImmutableArray.Create("normal"),
            new MonsterStatVector(46, 38, 34, 54, 38, 46), new MonsterStatVector(0, 0, 0, 0, 0, 0),
            new MonsterStatVector(0, 0, 0, 0, 0, 0), level,
            new CombatRatings(1, .05, .02, .1, .05), 1, 1, "montra-ghost-pot-v1", 1));
}
