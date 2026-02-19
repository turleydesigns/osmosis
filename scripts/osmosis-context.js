#!/usr/bin/env node
/**
 * Query Osmosis for relevant context tips.
 * Usage: node osmosis-context.js "deploy to fly.io"
 * Returns formatted tips for agent consumption.
 */

const query = process.argv.slice(2).join(' ') || '';
const port = process.env.OSMOSIS_API_PORT || 7432;

async function main() {
  const url = query
    ? `http://localhost:${port}/atoms/search?q=${encodeURIComponent(query)}`
    : `http://localhost:${port}/atoms`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Osmosis API error: ${res.status}`);
      process.exit(1);
    }

    const atoms = await res.json();
    if (atoms.length === 0) {
      console.log('No relevant knowledge found.');
      return;
    }

    // Sort by fitness and take top 5
    const top = atoms
      .sort((a, b) => (b.fitness_score || 0) - (a.fitness_score || 0))
      .slice(0, 5);

    for (const atom of top) {
      const tool = atom.tool_name ? `[${atom.tool_name}]` : `[${atom.type}]`;
      const outcome = atom.outcome === 'failure' ? '⚠️' : '✅';
      console.log(`${outcome} ${tool} ${atom.observation}`);
      if (atom.error_signature) {
        console.log(`   Error: ${atom.error_signature}`);
      }
    }
  } catch (err) {
    console.error(`Cannot reach Osmosis daemon: ${err.message}`);
    process.exit(1);
  }
}

main();
