import { getD1, getFilesBucket } from "../../../db";
import { authenticatedRequestGate, privateNoStoreHeaders } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";
import { canManageSystemSettings } from "../../../lib/system-settings";
import { TarWriter } from "../../../lib/tar-writer";

export const dynamic = "force-dynamic";

export const BACKUP_FORMAT = "people-pulse-backup/1";
// Sessions and rate-limit counters are rebuilt by the running system, and D1
// keeps its own migration ledger per database, so none of them belong in a backup.
const EXCLUDED_TABLES = new Set(["d1_migrations", "auth_sessions", "auth_rate_limits"]);
const ROW_PAGE = 500;
const FILE_PAGE = 500;

type TableInfo = { name: string; sql: string; columns: string[]; rows: number };
type FileInfo = {
  index: number;
  key: string;
  size: number;
  uploaded: string | null;
  contentType: string | null;
  customMetadata: Record<string, string>;
};

function encodeValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return { $bytes: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { $bytes: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  return value;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function quoteIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function listTables(d1: D1Database): Promise<TableInfo[]> {
  const { results } = await d1
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name")
    .all<{ name: string; sql: string }>();
  const tables: TableInfo[] = [];
  for (const row of results ?? []) {
    if (EXCLUDED_TABLES.has(row.name)) continue;
    const columns = await d1.prepare("SELECT name FROM pragma_table_info(?) ORDER BY cid").bind(row.name).all<{ name: string }>();
    tables.push({ name: row.name, sql: row.sql, columns: (columns.results ?? []).map((column) => column.name), rows: 0 });
  }
  return tables;
}

async function writeTable(d1: D1Database, tar: TarWriter, table: TableInfo) {
  const lines: string[] = [];
  for (let offset = 0; ; offset += ROW_PAGE) {
    const { results } = await d1
      .prepare(`SELECT * FROM ${quoteIdentifier(table.name)} ORDER BY rowid LIMIT ? OFFSET ?`)
      .bind(ROW_PAGE, offset)
      .all<Record<string, unknown>>();
    const rows = results ?? [];
    for (const row of rows) {
      const encoded: Record<string, unknown> = {};
      for (const column of table.columns) encoded[column] = encodeValue(row[column]);
      lines.push(JSON.stringify(encoded));
    }
    table.rows += rows.length;
    if (rows.length < ROW_PAGE) break;
  }
  await tar.addText(`database/${table.name}.ndjson`, lines.length ? `${lines.join("\n")}\n` : "");
}

async function writeFiles(bucket: R2Bucket, tar: TarWriter) {
  const files: FileInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor, limit: FILE_PAGE, include: ["httpMetadata", "customMetadata"] });
    for (const listed of page.objects) {
      const object = await bucket.get(listed.key);
      if (!object) continue; // Deleted between listing and download; the database row tells the importer.
      const index = files.length;
      await tar.addStream(`files/${index}.bin`, object.size, object.body);
      files.push({
        index,
        key: listed.key,
        size: object.size,
        uploaded: listed.uploaded ? new Date(listed.uploaded).toISOString() : null,
        contentType: object.httpMetadata?.contentType ?? listed.httpMetadata?.contentType ?? null,
        customMetadata: object.customMetadata ?? listed.customMetadata ?? {},
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await tar.addText("files.json", `${JSON.stringify(files, null, 2)}\n`);
  return files;
}

export async function GET(request: Request) {
  try {
    const gate = await authenticatedRequestGate(request);
    if (gate.response) return gate.response;
    if (!canManageSystemSettings(gate.currentUser)) {
      return Response.json({ error: "การสำรองข้อมูลทั้งระบบทำได้เฉพาะบัญชีเจ้าของระบบ" }, { status: 403, headers: privateNoStoreHeaders });
    }

    const d1 = getD1();
    const bucket = getFilesBucket();
    const createdAt = new Date();
    const tables = await listTables(d1);
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const tar = new TarWriter(writable.getWriter(), () => createdAt.getTime());

    const run = async () => {
      for (const table of tables) await writeTable(d1, tar, table);
      const files = await writeFiles(bucket, tar);
      // The manifest is the final entry so a truncated download is detectable by its absence.
      await tar.addText("manifest.json", `${JSON.stringify({
        format: BACKUP_FORMAT,
        createdAt: createdAt.toISOString(),
        createdBy: gate.currentUser.id,
        excludedTables: [...EXCLUDED_TABLES],
        tables,
        files: { count: files.length, bytes: files.reduce((total, file) => total + file.size, 0) },
      }, null, 2)}\n`);
      await tar.finish();
    };
    // Streams while the browser downloads; errors abort the stream so the archive never looks complete.
    void run().catch(async (error) => {
      console.error("[api/backup] export aborted", error);
      await tar.abort(error).catch(() => undefined);
    });

    const stamp = createdAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new Response(readable, {
      headers: {
        ...privateNoStoreHeaders,
        "content-type": "application/x-tar",
        "content-disposition": `attachment; filename="people-pulse-backup-${stamp}.tar"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return internalApiError(error, "สร้างไฟล์สำรองข้อมูลไม่สำเร็จ", "api/backup");
  }
}
