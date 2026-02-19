import { type AtomStore, type KnowledgeAtom, searchAtoms, getTopAtoms } from '@osmosis-ai/core';

/**
 * Query the local store for relevant knowledge atoms and format them
 * as concise context tips for the agent.
 */
export function getRelevantContext(
  taskDescription: string,
  store: AtomStore,
  limit: number = 5,
): string {
  // Search for atoms relevant to the task description
  const searched = searchAtoms(store, taskDescription, limit);

  // If search returns few results, pad with top fitness atoms
  let atoms: KnowledgeAtom[] = searched;
  if (atoms.length < limit) {
    const top = getTopAtoms(store, undefined, limit - atoms.length);
    const ids = new Set(atoms.map(a => a.id));
    for (const a of top) {
      if (!ids.has(a.id)) atoms.push(a);
    }
  }

  if (atoms.length === 0) return '';

  const lines = atoms.map(a => formatAtomTip(a));
  return lines.join('\n');
}

function formatAtomTip(atom: KnowledgeAtom): string {
  const toolName = (atom as any).tool_name;
  const prefix = toolName ? `Tool ${toolName}` : atom.type;
  const error = (atom as any).error_signature;
  const workaround = error ? ` Workaround: check error "${error}"` : '';
  return `⚡ ${prefix}: ${atom.observation}.${workaround}`;
}
