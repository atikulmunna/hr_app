import { request } from './client';
import {
  Certification,
  EmployeeSkillRow,
  ProficiencyLevel,
  RoleSkill,
  Skill,
  SkillMatrix,
} from './types';

// Skills, the matrix and certifications.
export const learning = {
  proficiencyLevels: (token: string) =>
    request<ProficiencyLevel[]>(token, '/learning/levels'),
  learningRoles: (token: string) => request<string[]>(token, '/learning/roles'),
  skills: (token: string) => request<Skill[]>(token, '/learning/skills'),
  createSkill: (
    token: string,
    body: { name: string; category?: string; description?: string },
  ) =>
    request<Skill>(token, '/learning/skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  roleSkills: (token: string, role: string) =>
    request<RoleSkill[]>(
      token,
      `/learning/role-skills?role=${encodeURIComponent(role)}`,
    ),
  setRoleSkill: (
    token: string,
    body: { role: string; skillId: string; requiredLevel: number },
  ) =>
    request<RoleSkill[]>(token, '/learning/role-skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeRoleSkill: (token: string, id: string) =>
    request<unknown>(token, `/learning/role-skills/${id}`, {
      method: 'DELETE',
    }),
  employeeSkills: (token: string, employeeId: string) =>
    request<EmployeeSkillRow[]>(
      token,
      `/learning/employee-skills?employeeId=${employeeId}`,
    ),
  setEmployeeSkill: (
    token: string,
    body: {
      employeeId: string;
      skillId: string;
      level: number;
      assessedOn?: string | null;
      note?: string | null;
    },
  ) =>
    request<EmployeeSkillRow[]>(token, '/learning/employee-skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeEmployeeSkill: (token: string, id: string) =>
    request<unknown>(token, `/learning/employee-skills/${id}`, {
      method: 'DELETE',
    }),
  skillMatrix: (token: string, role: string) =>
    request<SkillMatrix>(
      token,
      `/learning/matrix?role=${encodeURIComponent(role)}`,
    ),
  certifications: (token: string, employeeId?: string) =>
    request<Certification[]>(
      token,
      `/learning/certifications${employeeId ? `?employeeId=${employeeId}` : ''}`,
    ),
  createCertification: (
    token: string,
    body: {
      employeeId: string;
      name: string;
      issuer?: string;
      credentialId?: string;
      issuedOn?: string | null;
      expiresOn?: string | null;
    },
  ) =>
    request<Certification>(token, '/learning/certifications', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeCertification: (token: string, id: string) =>
    request<unknown>(token, `/learning/certifications/${id}`, {
      method: 'DELETE',
    }),

  // --- Documents and compliance (T-3.4).
};
