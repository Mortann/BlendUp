export type TeamRole = "artist" | "art_director";

export type TeamMember = {
  id: string;
  name: string;
  roles: TeamRole[];
  isOwner: boolean;
};

const membersStorageKey = "blendup:team-members";
const activeMemberStorageKey = "blendup:active-member";

export function loadTeamMembers(projectId?: string): TeamMember[] {
  const key = scopedKey(membersStorageKey, projectId);
  const stored = window.localStorage.getItem(key);

  if (!stored) {
    return defaultTeamMembers();
  }

  try {
    const members = JSON.parse(stored) as TeamMember[];
    const normalized = members
      .map(normalizeMember)
      .filter((member): member is TeamMember => Boolean(member));

    return ensureOwner(normalized.length > 0 ? normalized : defaultTeamMembers());
  } catch {
    return defaultTeamMembers();
  }
}

export function saveTeamMembers(members: TeamMember[], projectId?: string) {
  window.localStorage.setItem(scopedKey(membersStorageKey, projectId), JSON.stringify(ensureOwner(members)));
}

export function loadActiveMemberId(projectId?: string): string | null {
  return window.localStorage.getItem(scopedKey(activeMemberStorageKey, projectId));
}

export function saveActiveMemberId(memberId: string, projectId?: string) {
  window.localStorage.setItem(scopedKey(activeMemberStorageKey, projectId), memberId);
}

export function createMemberId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${slug || "member"}_${Date.now().toString(36)}`;
}

function scopedKey(key: string, projectId?: string) {
  return projectId ? `${key}:${projectId}` : key;
}

function defaultTeamMembers(): TeamMember[] {
  return [
    {
      id: "owner",
      name: "Createur du projet",
      roles: ["artist", "art_director"],
      isOwner: true
    }
  ];
}

function normalizeMember(member: Partial<TeamMember>): TeamMember | null {
  const name = member.name?.trim();

  if (!name) {
    return null;
  }

  const roles = (member.roles ?? []).filter(
    (role): role is TeamRole => role === "artist" || role === "art_director"
  );

  return {
    id: member.id?.trim() || createMemberId(name),
    name,
    roles: roles.length > 0 ? roles : ["artist"],
    isOwner: Boolean(member.isOwner)
  };
}

function ensureOwner(members: TeamMember[]) {
  const ownerId = members.find((member) => member.id === "owner")?.id ?? members[0]?.id;

  return members.map((member) => {
    if (member.id === ownerId) {
      const ownerRoles: TeamRole[] = Array.from(new Set<TeamRole>([...member.roles, "artist", "art_director"]));

      return {
        ...member,
        isOwner: true,
        roles: ownerRoles
      };
    }

    return {
      ...member,
      isOwner: false
    };
  });
}
