using MonsterLifeEventsApp;
using MonsterLifeEventsApp.Combat;

sealed record GhostSkillFrame(CombatPosition Origin, string TargetId, CombatPosition TargetPosition,
    int TargetLevel, double TargetHp, double TargetMaxHp, double TargetDefenseScale);
sealed record GhostSkillStrike(string TargetId, string SkillId, bool Hit, bool Critical, double DamageScale);

// The original command runtime owns admission. The legacy combat simulator evaluates a
// single Montra snapshot, leaving live HP, cooldowns and world state with Montra.
sealed class GhostSkillSource(OwnedMonsterWorldSource world, Roster roster) : IOwnedMonsterControlSource
{
    private GhostSkillFrame? frame;
    private GhostSkillStrike? strike;
    private long sequence;

    public (OwnedMonsterCommandResult Result, GhostSkillStrike? Strike) Cast(OwnedMonsterControlRuntime runtime,
        string owner, OwnedMonsterCommand command, GhostSkillFrame snapshot, DateTime now)
    {
        frame = snapshot;
        try { return (runtime.Handle(owner, command, now), strike); }
        finally { frame = null; strike = null; }
    }

    public bool TryUseSkill(string owner, OwnedMonsterCommand command, out OwnedMonsterSnapshot monster, out long revision, out string code)
    {
        revision = 0;
        code = "ACTIVE_MONSTER_STALE";
        if (!world.TryGetOwnedMonster(owner, command.InstanceId, out monster) || !monster.Active ||
            !world.CaptureOwnedActors(command.Zone, DateTime.UtcNow)
                .Any(actor => actor.OwnerId == owner && actor.Generation == command.ExpectedActiveGeneration))
            return false;

        code = "SKILL_NOT_OWNED";
        var definition = roster.ReadParty(owner).Single(item => item.InstanceId == command.InstanceId);
        var action = definition.Actions.SingleOrDefault(item => item.ActionId == command.SkillId);
        if (action is null) return false;

        code = "TARGET_NOT_FOUND";
        if (frame is not { } target || command.TargetActorId != target.TargetId ||
            target.TargetLevel < 1 || target.TargetHp <= 0 || target.TargetHp > target.TargetMaxHp ||
            !double.IsFinite(target.TargetDefenseScale) || target.TargetDefenseScale < 0)
            return false;

        var defense = target.TargetDefenseScale * Roster.BaseStats.Def;
        var targetProfile = AuthoritativeCombatProfileAdapter.Create("montra-target:" + target.TargetId, "montra",
            CombatEntityKind.Npc, target.TargetLevel, ["normal"],
            new CombatStats(target.TargetMaxHp, target.TargetHp, 0, defense, 0, defense, 0, 1, 0, 0, 0, 0),
            1, "montra-world/v1", "montra-target/v1", 1);
        var snapshot = WorldTickSnapshotFactory.Create(++sequence, "montra-world/v1", [
            new(definition.Profile, command.Zone, target.Origin, new(), new()),
            new(targetProfile, command.Zone, target.TargetPosition, new(), new()),
        ]);
        var attack = CentralCombatSimulator.Resolve(snapshot, new CombatIntent(command.CommandId, "montra-ghost-skill",
            definition.InstanceId, targetProfile.EntityId, snapshot.Tick, snapshot.Fingerprint,
            definition.Profile.StateVersion, targetProfile.StateVersion, definition.Profile.Fingerprint, targetProfile.Fingerprint,
            sequence, 0, action));
        code = attack.Code;
        if (!attack.Accepted) return false;
        strike = new(target.TargetId, action.ActionId, attack.Hit, attack.Critical, attack.Damage / Roster.BaseStats.Atk);
        revision = sequence;
        return true;
    }

    public bool TryGetOwnedMonster(string owner, string instance, out OwnedMonsterSnapshot monster) =>
        world.TryGetOwnedMonster(owner, instance, out monster);

    public bool TryGetOwnedRoster(string owner, string zone, out IReadOnlyList<OwnedMonsterSnapshot> monsters) =>
        world.TryGetOwnedRoster(owner, zone, out monsters);

    public bool TrySummon(string owner, string instance, string zone, OwnedMonsterPoint point, out OwnedMonsterSnapshot monster, out string code) =>
        world.TrySummon(owner, instance, zone, point, out monster, out code);

    public bool TryRecall(string owner, string instance, string zone, long generation, out OwnedMonsterSnapshot monster, out string code) =>
        world.TryRecall(owner, instance, zone, generation, out monster, out code);

    public bool TrySwitch(string owner, string instance, string current, long generation, string zone, OwnedMonsterPoint point,
        out OwnedMonsterSnapshot monster, out string code) =>
        world.TrySwitch(owner, instance, current, generation, zone, point, out monster, out code);
}
