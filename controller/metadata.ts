// Copyright The Linux Foundation and each contributor to LFX.
// SPDX-License-Identifier: MIT
import { z } from "zod";
const user = z.object({ login: z.string() });
const ref = z.object({ sha: z.string(), ref: z.string().optional() });
export const prMetadata = z.object({
  number: z.number(), state: z.string(), merged: z.boolean().optional(),
  draft: z.boolean().optional(), head: ref, base: ref, user,
  title: z.string().optional(), body: z.string().nullable().optional(),
  html_url: z.string().optional(), author_association: z.string().optional(),
  mergeable: z.boolean().nullable().optional(), mergeable_state: z.string().optional(),
  additions: z.number().optional(), deletions: z.number().optional(),
  changed_files: z.number().optional(), review_comments: z.number().optional(),
});
export const reviewMetadata = z.object({
  id: z.number(), state: z.string(), body: z.string().nullable(), user: user.nullable(),
  commit_id: z.string().nullable().optional(), submitted_at: z.string().nullable().optional(),
  html_url: z.string().optional(),
});
export const commentMetadata = z.object({
  id: z.number(), body: z.string().optional(), user: user.nullable(),
  updated_at: z.string(), created_at: z.string().optional(),
  html_url: z.string().optional(), author_association: z.string().optional(),
});
