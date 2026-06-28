import { CheckCircle2, Code2, Palette, Plus, ShieldCheck, Sparkles, Trash2, UserCog, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Role } from "../blendup/roles";
import type { ProjectSnapshot } from "../blendup/types";
import {
  createMemberId,
  loadActiveMemberId,
  loadTeamMembers,
  saveActiveMemberId,
  saveTeamMembers,
  type TeamMember,
  type TeamRole
} from "../app/people";

export function TeamView({
  project,
  setRole
}: {
  project: ProjectSnapshot;
  setRole: (role: Role) => void;
}) {
  const projectId = project.project.projectId;
  const [members, setMembers] = useState<TeamMember[]>(() => loadTeamMembers(projectId));
  const [activeMemberId, setActiveMemberId] = useState(() => loadActiveMemberId(projectId) ?? "owner");
  const [draftName, setDraftName] = useState("");
  const activeMember = useMemo(() => members.find((member) => member.id === activeMemberId) ?? members[0], [activeMemberId, members]);
  const canManage = activeMember?.isOwner ?? false;

  useEffect(() => {
    saveTeamMembers(members, projectId);
  }, [members, projectId]);

  useEffect(() => {
    if (activeMember) {
      saveActiveMemberId(activeMember.id, projectId);
    }
  }, [activeMember, projectId]);

  const addMember = () => {
    const name = draftName.trim();

    if (!name || !canManage) {
      return;
    }

    setMembers((current) => [
      ...current,
      {
        id: createMemberId(name),
        name,
        roles: ["artist"],
        isOwner: false
      }
    ]);
    setDraftName("");
  };

  return (
    <section className="team-page role-page" aria-label="Equipe">
      <div className="team-header surface-panel">
        <div>
          <span className="eyebrow">Equipe locale</span>
          <h2>Comptes simples</h2>
          <p className="soft-text">
            Chaque personne choisit qui elle est. L'owner reste le createur du projet et gere les roles.
          </p>
        </div>
        <div className="active-member-card">
          <UserCog size={20} />
          <span>Connecte</span>
          <strong>{activeMember?.name ?? "Personne"}</strong>
        </div>
      </div>

      <div className="team-layout">
        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Choisir</span>
              <h2>Qui travaille ?</h2>
            </div>
          </div>
          <div className="member-picker">
            {members.map((member) => (
              <button
                className={member.id === activeMember?.id ? "active" : ""}
                key={member.id}
                onClick={() => {
                  setActiveMemberId(member.id);
                  setRole(viewRoleFromMember(member));
                }}
                type="button"
              >
                <UsersRound size={17} />
                <span>{member.name}</span>
                {member.id === activeMember?.id ? <CheckCircle2 size={16} /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Owner</span>
              <h2>Gestion</h2>
            </div>
          </div>
          <div className="team-create-row">
            <input
              disabled={!canManage}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addMember();
                }
              }}
              placeholder="Nom du compte"
            />
            <button disabled={!canManage} onClick={addMember} type="button">
              <Plus size={16} />
              Ajouter
            </button>
          </div>
          <div className="member-list">
            {members.map((member) => (
              <MemberRow
                canManage={canManage}
                key={member.id}
                member={member}
                onDelete={() => setMembers((current) => current.filter((item) => item.id !== member.id || item.isOwner))}
                onToggleRole={(role) =>
                  setMembers((current) =>
                    current.map((item) => {
                      if (item.id !== member.id) {
                        return item;
                      }

                      const hasRole = item.roles.includes(role);
                      const nextRoles = hasRole
                        ? item.roles.filter((itemRole) => itemRole !== role)
                        : [...item.roles, role];

                      return {
                        ...item,
                        roles: nextRoles.length > 0 ? nextRoles : [role]
                      };
                    })
                  )
                }
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function MemberRow({
  canManage,
  member,
  onDelete,
  onToggleRole
}: {
  canManage: boolean;
  member: TeamMember;
  onDelete: () => void;
  onToggleRole: (role: TeamRole) => void;
}) {
  return (
    <div className="member-row">
      <div>
        <strong>{member.name}</strong>
        <span>{member.isOwner ? "Owner" : "Membre"}</span>
      </div>
      <button
        className={member.roles.includes("artist") ? "active" : ""}
        disabled={!canManage}
        onClick={() => onToggleRole("artist")}
        type="button"
      >
        <Sparkles size={15} />
        Artiste
      </button>
      <button
        className={member.roles.includes("developer") ? "active" : ""}
        disabled={!canManage}
        onClick={() => onToggleRole("developer")}
        type="button"
      >
        <Code2 size={15} />
        Dev
      </button>
      <button
        className={member.roles.includes("art_director") ? "active" : ""}
        disabled={!canManage}
        onClick={() => onToggleRole("art_director")}
        type="button"
      >
        <Palette size={15} />
        DA
      </button>
      <button className={member.isOwner ? "owner-lock active" : "owner-lock"} disabled type="button">
        <ShieldCheck size={15} />
        Owner
      </button>
      <button disabled={!canManage || member.isOwner} onClick={onDelete} type="button">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function viewRoleFromMember(member: TeamMember): Role {
  if (member.roles.includes("developer") && !member.roles.includes("artist")) {
    return "developer";
  }

  return "artist";
}
