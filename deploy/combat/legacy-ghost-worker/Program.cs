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
    if (command.Kind is not ("summon" or "recall" or "switch") ||
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
    var result = runtime.Handle(input.Owner, command, now);
    var active = world.CaptureOwnedActors(command.Zone, now)
        .SingleOrDefault(actor => actor.OwnerId == input.Owner);
    return new { result.Accepted, result.Code, result.Replay, active = active is null ? null : new
        { active.ActorId, instanceId = result.Monster?.InstanceId, active.Generation, active.Pose.X, active.Pose.Y, active.Pose.Z } };
}

sealed record Ghost(string InstanceId, string SpeciesId, int Level, int Slot);
sealed record Request(string Owner, OwnedMonsterPoint? Position, Ghost[]? Party, OwnedMonsterCommand? Command, bool Disconnect);

sealed class Roster : IOwnedMonsterCanonicalReader
{
    private static readonly CombatActionDefinition BasicAttack = CombatActionCatalogProviderV91.LoadEmbedded().GetRequired("SK_FIRE_01").Definition;
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

    private static OwnedMonsterDefinition Create(string ownerId, Ghost ghost)
    {
        var profile = PocketMonsterCombatCalculator.Calculate(new PocketMonsterCombatInput(
            ghost.InstanceId, "pocket-monster", ImmutableArray.Create("normal"),
            new MonsterStatVector(46, 38, 34, 54, 38, 46), new MonsterStatVector(0, 0, 0, 0, 0, 0),
            new MonsterStatVector(0, 0, 0, 0, 0, 0), ghost.Level,
            new CombatRatings(1, .05, .02, .1, .05), 1, 1, "montra-ghost-pot-v1", 1));
        return new(ghost.InstanceId, ownerId, ghost.SpeciesId, profile, [], ghost.Slot, BasicAttack: BasicAttack);
    }
}
