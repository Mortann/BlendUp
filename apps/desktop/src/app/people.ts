import type { Role } from "../blendup/roles";

export type TeamMember = {
  id: string;
  name: string;
  roles: Role[];
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
      name: "Owner",
      roles: ["artist", "developer"],
      isOwner: true
    }
  ];
}

function normalizeMember(member: Partial<TeamMember>): TeamMember | null {
  const name = member.name?.trim();

  if (!name) {
    return null;
  }

  const roles = (member.roles ?? []).filter((role): role is Role => role === "artist" || role === "developer");

  return {
    id: member.id?.trim() || createMemberId(name),
    name,
    roles: roles.length > 0 ? roles : ["artist"],
    isOwner: Boolean(member.isOwner)
  };
}

function ensureOwner(members: TeamMember[]) {
  if (members.some((member) => member.isOwner)) {
    return members;
  }

  return members.map((member, index) => ({
    ...member,
    isOwner: index === 0
  }));
}
