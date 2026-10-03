import type { LinkOrigin, LinkStatus, NoteType, ParaBucket, Relation, Stage } from "@jarvis/core";

export interface NoteRow {
  id: string;
  workspace_id: string;
  type: NoteType;
  title: string;
  slug: string;
  content_md: string;
  summary: string | null;
  properties: Record<string, unknown>;
  para_bucket: ParaBucket;
  stage: Stage;
  aliases: string[];
  created_by: "user" | "ai";
  created_at: string;
  updated_at: string;
}

export interface LinkRow {
  id: string;
  workspace_id: string;
  from_note: string;
  to_note: string;
  relation: Relation;
  origin: LinkOrigin;
  confidence: number | null;
  status: LinkStatus;
  rationale: string | null;
  created_at: string;
}

export interface SourceRow {
  id: string;
  workspace_id: string;
  channel: string;
  kind: "audio" | "text" | "image" | "link" | "pdf";
  raw_text: string | null;
  storage_path: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  context_note_id: string | null;
  status: "pending" | "processing" | "done" | "error";
  error: string | null;
  attempts: number;
  captured_at: string;
}

export interface GraphSnapshot {
  nodes: {
    id: string;
    title: string;
    type: NoteType;
    stage: Stage;
    para: ParaBucket;
    degree: number;
    x: number | null;
    y: number | null;
    created_at: string;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    relation: Relation;
    status: LinkStatus;
    origin: LinkOrigin;
    rationale: string | null;
  }[];
}
