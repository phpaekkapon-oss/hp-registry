/**
 * Writes Thai release notes with the AI assistant (keys and model order from Settings → AI).
 * Called over SSH by scripts/deploy.cjs before each build:
 *   echo '{"version":"1.0.3","commits":[...],"files":[...]}' | npx tsx scripts/ai-release-notes.ts
 * Prints ONE line of JSON: {"ok":true,"title":...,"kind":...,"highlights":[...],"model":...} or {"ok":false,"error":...}
 */
import 'dotenv/config';
import { writeReleaseNotes, type ReleaseNotesInput } from '../src/services/ai';
import { getPool } from '../src/services/mysql';

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

let out: Record<string, unknown>;
try {
  const input = JSON.parse(await readStdin()) as Partial<ReleaseNotesInput>;
  if (typeof input.version !== 'string') throw new Error('missing version');
  const notes = await writeReleaseNotes(
    {
      version: input.version,
      commits: Array.isArray(input.commits) ? input.commits.map(String).slice(0, 60) : [],
      files: Array.isArray(input.files) ? input.files.map(String).slice(0, 120) : [],
    },
    'deploy'
  );
  out = { ok: true, ...notes };
} catch (e) {
  out = { ok: false, error: (e as Error).message };
}
console.log(`@@AI@@${JSON.stringify(out)}`);
await getPool().end().catch(() => undefined);
