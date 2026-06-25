// GET  /api/chat               -> [{name, text, at}, ...] most recent first
// POST /api/chat {name, text}  -> appends a message, returns the updated list
//
// All messages are visible to anyone with the link, same as everything else in this app —
// there's no moderation here beyond basic length limits, so treat it like a group chat.

const KEY = 'wc26:chat';
const MAX_MESSAGES = 200;
const MAX_TEXT_LENGTH = 500;

export async function onRequestGet({ env }) {
  const raw = await env.PICKS_KV.get(KEY);
  const messages = raw ? JSON.parse(raw) : [];
  return Response.json(messages);
}

export async function onRequestPost({ env, request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const name = (body.name || '').trim().slice(0, 24);
  const text = (body.text || '').trim().slice(0, MAX_TEXT_LENGTH);
  if (!name || !text) return new Response('Missing "name" or "text"', { status: 400 });

  const raw = await env.PICKS_KV.get(KEY);
  const messages = raw ? JSON.parse(raw) : [];

  messages.push({ name, text, at: new Date().toISOString() });
  while (messages.length > MAX_MESSAGES) messages.shift(); // keep storage bounded

  await env.PICKS_KV.put(KEY, JSON.stringify(messages));
  return Response.json(messages);
}
