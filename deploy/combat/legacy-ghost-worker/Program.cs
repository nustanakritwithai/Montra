using System.Collections.Immutable;
using System.Text.Json;
using MonsterLifeEventsApp;
using MonsterLifeEventsApp.Combat;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var roster = new Roster();
var presence = new Dictionary<string, OwnedMonsterOwnerPresence>(StringComparer.Ordinal);
var world = new OwnedMonsterWorldSource(roster, id => presence.GetValueOrDefault(id), _ => null,
    combatEnabled: () => false);
var runtime = new OwnedMonsterControlRuntime(world);

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
    if (command.Kind is not ("summon" or "recall") ||
        input.Ghost is not { } ghost || input.Position is not { } position ||
        !double.IsFinite(position.X) || !double.IsFinite(position.Y) || !double.IsFinite(position.Z) ||
        string.IsNullOrWhiteSpace(command.Zone) || ghost.Level is < 1 or > PocketMonsterCombatCalculator.MaxLevel)
        throw new ArgumentException();

    var now = DateTime.UtcNow;
    presence[input.Owner] = new(command.Zone, position, now);
    roster.Set(input.Owner, ghost);
    world.RefreshParty(input.Owner);
    var result = runtime.Handle(input.Owner, command, now);
    var active = world.CaptureOwnedActors(command.Zone, now)
        .SingleOrDefault(actor => actor.OwnerId == input.Owner);
    return new { result.Accepted, result.Code, result.Replay, active = active is null ? null : new
        { active.ActorId, active.Generation, active.Pose.X, active.Pose.Y, active.Pose.Z } };
}

sealed record Ghost(string InstanceId, string SpeciesId, int Level);
sealed record Request(string Owner, OwnedMonsterPoint? Position, Ghost? Ghost, OwnedMonsterCommand? Command, bool Disconnect);

sealed class Roster : IOwnedMonsterCanonicalReader
{
    private static readonly CombatActionDefinition BasicAttack = CombatActionCatalogProviderV91.LoadEmbedded().GetRequired("SK_FIRE_01").Definition;
    private readonly Dictionary<string, OwnedMonsterDefinition> definitions = new(StringComparer.Ordinal);

    public IReadOnlyList<OwnedMonsterDefinition> ReadParty(string ownerId) =>
        definitions.TryGetValue(ownerId, out var definition) ? [definition] : [];

    public void Remove(string ownerId) => definitions.Remove(ownerId);

    public void Set(string ownerId, Ghost ghost)
    {
        if (definitions.TryGetValue(ownerId, out var current) &&
            current.InstanceId == ghost.InstanceId && current.SpeciesId == ghost.SpeciesId &&
            current.Profile.Level == ghost.Level) return;
        var profile = PocketMonsterCombatCalculator.Calculate(new PocketMonsterCombatInput(
            ghost.InstanceId, "pocket-monster", ImmutableArray.Create("normal"),
            new MonsterStatVector(46, 38, 34, 54, 38, 46), new MonsterStatVector(0, 0, 0, 0, 0, 0),
            new MonsterStatVector(0, 0, 0, 0, 0, 0), ghost.Level,
            new CombatRatings(1, .05, .02, .1, .05), 1, 1, "montra-ghost-pot-v1", 1));
        definitions[ownerId] = new(ghost.InstanceId, ownerId, ghost.SpeciesId, profile, [], 0, BasicAttack: BasicAttack);
    }
}
