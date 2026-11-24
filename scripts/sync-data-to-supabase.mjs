import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataPath = resolve(projectRoot, "data.js");
const configPath = resolve(projectRoot, "supabase-config.js");
const applyChanges = process.argv.includes("--apply");

const requiredFields = [
  "id",
  "name",
  "studentId",
  "department",
  "category",
  "quote",
  "bio",
  "title",
  "description",
  "story",
  "cover",
  "accent",
];

const mimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const readProjectUrl = async () => {
  if (process.env.SUPABASE_URL?.trim()) return process.env.SUPABASE_URL.trim().replace(/\/$/, "");
  const config = await readFile(configPath, "utf8");
  const match = config.match(/url\s*:\s*["']([^"']+)["']/);
  if (!match) throw new Error("Missing SUPABASE_URL and could not read url from supabase-config.js.");
  return match[1].trim().replace(/\/$/, "");
};

const loadParticipants = async () => {
  const source = await readFile(dataPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: dataPath });
  const participants = sandbox.window.PARTICIPANTS;
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("data.js does not contain a non-empty window.PARTICIPANTS array.");
  }
  return participants;
};

const validateParticipants = (participants) => {
  const ids = new Set();
  for (const [index, participant] of participants.entries()) {
    const missing = requiredFields.filter((field) => !String(participant[field] ?? "").trim());
    if (missing.length > 0) {
      throw new Error(`Entry ${index + 1} is missing: ${missing.join(", ")}`);
    }
    if (ids.has(participant.id)) throw new Error(`Duplicate participant id: ${participant.id}`);
    ids.add(participant.id);
    if (!/^https?:\/\//i.test(participant.cover) && !Object.hasOwn(mimeTypes, extname(participant.cover).toLowerCase())) {
      throw new Error(`Unsupported cover type for ${participant.id}: ${participant.cover}`);
    }
  }
};

const request = async (url, options, action) => {
  const response = await fetch(url, options);
  if (response.ok) return response;
  const details = await response.text();
  throw new Error(`${action} failed with ${response.status}: ${details}`);
};

const encodedPath = (path) => path.split("/").map(encodeURIComponent).join("/");

const uploadCover = async (baseUrl, serviceKey, participant) => {
  const relativePath = participant.cover.replaceAll("\\", "/");
  const localPath = resolve(projectRoot, relativePath);
  const extension = extname(relativePath).toLowerCase();
  const filename = basename(relativePath);
  const storagePath = `seed/${participant.id}/${filename}`;
  const body = await readFile(localPath);
  const contentType = mimeTypes[extension];

  await request(
    `${baseUrl}/storage/v1/object/artworks/${encodedPath(storagePath)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": contentType,
        "x-upsert": "true",
        "cache-control": "3600",
      },
      body,
    },
    `Uploading ${participant.cover}`,
  );

  return `${baseUrl}/storage/v1/object/public/artworks/${encodedPath(storagePath)}`;
};

const toRow = (participant, cover) => ({
  id: participant.id,
  name: participant.name.trim(),
  student_id: participant.studentId.trim(),
  department: participant.department.trim(),
  category: participant.category.trim(),
  quote: participant.quote.trim(),
  bio: participant.bio.trim(),
  title: participant.title.trim(),
  description: participant.description.trim(),
  story: participant.story.trim(),
  cover,
  accent: participant.accent.trim(),
});

const printPlan = (participants) => {
  console.log(`Prepared ${participants.length} participant records from data.js.`);
  for (const participant of participants) {
    console.log(`  ${participant.id}  ${participant.name}  ${participant.title}  ${participant.cover}`);
  }
  console.log("Dry run only. Add --apply to upload covers and upsert rows.");
};

const main = async () => {
  const participants = await loadParticipants();
  validateParticipants(participants);
  if (!applyChanges) {
    printPlan(participants);
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in the terminal before using --apply.");
  }

  const baseUrl = await readProjectUrl();
  const rows = [];
  for (const participant of participants) {
    const cover = /^https?:\/\//i.test(participant.cover)
      ? participant.cover
      : await uploadCover(baseUrl, serviceKey, participant);
    rows.push(toRow(participant, cover));
    console.log(`Uploaded cover for ${participant.id}`);
  }

  await request(
    `${baseUrl}/rest/v1/participants?on_conflict=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
    "Upserting participants",
  );
  console.log(`Synced ${rows.length} participant records to Supabase.`);
};

main().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exitCode = 1;
});
