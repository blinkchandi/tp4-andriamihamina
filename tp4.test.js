// Tests du TP 4 · lancer : node --test seance4-patterns/tp4-andriamihamina/tp4.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Channel, createChannel, registerChannel } from './notifications/channels.js';

// --- Étape 1 · Factory Method + registre ---

const message = { to: 'alice@exemple.fr', body: 'Votre colis est parti', priority: 'normale' };

test('Factory : un canal par type, erreur si inconnu', () => {
  assert.equal(createChannel('email').send(message), '[EMAIL → alice@exemple.fr] Votre colis est parti');
  assert.equal(createChannel('sms').send(message), '[SMS → alice@exemple.fr] Votre colis est parti');
  assert.equal(createChannel('push').send(message), '[PUSH → alice@exemple.fr] Votre colis est parti');
  assert.throws(() => createChannel('pigeon'), /Canal inconnu : pigeon/);
});

test('Factory : le SMS est tronqué à 160 caractères', () => {
  const sent = createChannel('sms').send({ ...message, body: 'x'.repeat(200) });
  assert.equal(sent, `[SMS → alice@exemple.fr] ${'x'.repeat(160)}`);
});

test('Factory : la classe de base est abstraite', () => {
  assert.throws(() => new Channel().send(message), /méthode abstraite/);
});

test('Factory (OCP) : Slack ajouté sans modifier channels.js', async () => {
  assert.throws(() => createChannel('slack'), /Canal inconnu/); // pas encore installé
  await import('./notifications/slack.js');
  assert.equal(createChannel('slack').send({ to: 'logistique', body: 'Tarifs mis à jour' }),
    '[SLACK #logistique] Tarifs mis à jour');
  const src = readFileSync(new URL('./notifications/channels.js', import.meta.url), 'utf8');
  assert.equal(/slack/i.test(src), false);
});

test('Factory : une classe qui n’hérite pas de Channel est refusée', () => {
  class Pigeon { send() { return 'roucou'; } }
  assert.throws(() => registerChannel('pigeon', Pigeon), /doit hériter de Channel/);
  assert.throws(() => createChannel('pigeon'), /Canal inconnu/); // rien n'a été enregistré
});
