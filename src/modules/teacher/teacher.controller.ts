import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as groupTeacherService from "./group-teacher.service";
import type {
  AddCoTeacherInput,
  AddMemberInput,
  CreateGroupInput,
  GroupMembersQuery,
  RemoveMemberInput,
  StudentGroupsQuery,
  TeacherGroupsQuery,
  UpdateGroupInput,
} from "./teacher.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const createGroup = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<CreateGroupInput>(req);

    const result = await groupTeacherService.createGroup(userId, body);
    return res.status(200).json(result);
  },
);

export const getAllGroups = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<TeacherGroupsQuery>(req);

    const groups = await groupTeacherService.getAllGroups(userId, query);
    return res.status(200).json(groups);
  },
);

export const getGroupDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const group = await groupTeacherService.getGroupDetails(userId, groupId);
    return res.status(200).json(group);
  },
);

export const getGroupMembers = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<GroupMembersQuery>(req);

    const members = await groupTeacherService.getGroupMembers(userId, query);
    return res.status(200).json(members);
  },
);

export const getGroupExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const exams = await groupTeacherService.getGroupExams(userId, groupId);
    return res.status(200).json(exams);
  },
);

export const addMemberToGroup = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<AddMemberInput>(req);

    const result = await groupTeacherService.addMemberToGroup(userId, body);
    return res.status(200).json(result);
  },
);

export const addCoTeacherToGroup = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<AddCoTeacherInput>(req);

    const result = await groupTeacherService.addCoTeacherToGroup(userId, body);
    return res.status(200).json(result);
  },
);

export const removeMemberFromGroup = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<RemoveMemberInput>(req);

    const result = await groupTeacherService.removeMemberFromGroup(
      userId,
      body,
    );
    return res.status(200).json(result);
  },
);

export const updateGroupDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<UpdateGroupInput>(req);

    const group = await groupTeacherService.updateGroupDetails(userId, body);
    return res.status(200).json(group);
  },
);

export const deleteGroup = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedBody<{ groupId: string }>(req);

    const result = await groupTeacherService.deleteGroup(userId, groupId);
    return res.status(200).json(result);
  },
);

export const getStudentGroups = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<StudentGroupsQuery>(req);

    const result = await groupTeacherService.getStudentGroups(userId, query);
    return res.status(200).json(result);
  },
);

export const getStudentGroupsStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const stats = await groupTeacherService.getStudentGroupsStats(userId);
    return res.status(200).json(stats);
  },
);
