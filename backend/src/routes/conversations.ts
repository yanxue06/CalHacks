import { Router } from 'express';
import { prisma } from '../services/db.service';

export const conversations = Router();

conversations.post('/', async (req, res) => {
  const { title, vapiCallId } = req.body ?? {};
  const convo = await prisma.conversation.create({ data: { title, vapiCallId, status: 'active' } });
  res.json(convo);
});

conversations.post('/:id/messages', async (req, res) => {
  const { speaker, text, startMs, endMs, isFinal = true } = req.body ?? {};
  const msg = await prisma.message.create({
    data: { conversationId: req.params.id, speaker, text, startMs, endMs, isFinal }
  });
  res.json(msg);
});

conversations.post('/:id/end', async (req, res) => {
  const convo = await prisma.conversation.update({
    where: { id: req.params.id }, data: { endedAt: new Date(), status: 'ended' }
  });
  res.json(convo);
});

conversations.get('/', async (_req, res) => {
  const list = await prisma.conversation.findMany({ orderBy: { startedAt: 'desc' } });
  res.json(list);
});

conversations.get('/:id', async (req, res) => {
  const convo = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } }, summaries: { orderBy: { createdAt: 'desc' } } }
  });
  res.json(convo);
});


