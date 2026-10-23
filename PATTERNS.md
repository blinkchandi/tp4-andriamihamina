# PATTERNS — TP 4 · binôme andriamihamina · parcours Dev

## Tableau des patterns

| Pattern | Problème résolu dans ShopLite | Alternative écartée | Pourquoi écartée |
|---|---|---|---|
| **Factory Method + registre** (`notifications/channels.js`) | Créer le bon canal (e-mail, SMS, push) à partir du nom choisi par le client, et ajouter Slack pour la logistique **sans rouvrir** `channels.js` : `slack.js` appelle `registerChannel('slack', SlackChannel)`. | Un `switch (type)` dans une fonction `createChannel`. | Chaque nouveau canal oblige à modifier et re-tester la fabrique (violation OCP) ; avec le registre, un canal = un fichier qui s'enregistre. `registerChannel` refuse une classe qui n'hérite pas de `Channel`, pour garder le contrat. |
| **Builder** (`notifications/MessageBuilder.js`) | Construire un message `{ to, body, priority }` à partir d'un gabarit `{{nom}}` et de valeurs fournies dans n'importe quel ordre, validé **une seule fois** dans `build()`, puis gelé (`Object.freeze`). | Un constructeur `new Message(to, template, valeurs, priority)`. | 4 paramètres dont un facultatif : appels illisibles et erreurs d'ordre. La règle « chaque variable du gabarit a une valeur » demande d'avoir le gabarit ET les valeurs : elle ne peut être vérifiée qu'à la fin, dans `build()`. |
| **Adapter** (`shipping/adapters.js`) | Colissimo (synchrone, grammes, centimes) et DHL (asynchrone, kilos, montant en texte) ne parlent pas le même langage ; `carrierApis.js` n'est pas modifiable. Les deux adaptateurs exposent notre contrat `getQuote({ weightKg, zip }) → Promise<{ carrier, price, days }>`. | Des `if (carrier === 'DHL')` avec les conversions dans le code qui compare les prix. | Les conversions seraient dupliquées partout où l'on utilise un transporteur, et un 3e transporteur obligerait à modifier ce code. Avec Adapter, un nouveau transporteur = un nouvel adaptateur. |
| **Decorator** (`shipping/decorators.js`) | Rendre DHL fiable (il renvoie parfois 503) et éviter de redemander un tarif déjà connu, **sans toucher aux adaptateurs** : `RetryQuote` et `CachedQuote` ont la même interface `getQuote` et s'empilent. | Ajouter le retry et le cache directement dans `DhlAdapter` (ou une sous-classe `CachedRetryDhlAdapter`). | Il faudrait le refaire pour chaque transporteur, et chaque combinaison (cache seul, retry seul, les deux) deviendrait une sous-classe. Les décorateurs se combinent librement : `main.js` met un cache seul sur Colissimo, cache(retry) sur DHL. |
| **Facade** (`shipping/ShippingService.js`) | Le reste de l'application veut juste « le meilleur tarif » : `bestQuote(parcel)` interroge tous les transporteurs **en parallèle** (`Promise.allSettled`), ignore ceux en panne, choisit le moins cher puis le plus rapide, et lève « Aucun transporteur disponible » si personne ne répond. | Laisser chaque appelant boucler sur les transporteurs avec des `try/catch`. | Logique dupliquée et fragile (une panne non attrapée fait tout échouer ; un `await` dans une boucle rend les appels séquentiels). La façade cache cette complexité derrière une méthode. |

## Pourquoi le cache doit envelopper le retry, et pas l'inverse

Composition retenue : `new CachedQuote(new RetryQuote(new DhlAdapter(client)))`.

- **Cache(Retry(dhl))** : le cache ne voit que le **résultat final**, une fois que le retry a absorbé
  les pannes passagères. Il ne mémorise donc que des devis réussis, et un devis en cache ne déclenche
  même pas le retry (aucun appel réseau).
- **Retry(Cache(dhl))** : le cache serait au contact direct du transporteur et verrait chaque 503.
  S'il mettait en cache le résultat de l'appel, erreur comprise (cas classique quand on mémorise la
  promesse), l'erreur resterait en cache pendant `ttlMs` : toutes les tentatives suivantes du retry
  recevraient la même erreur mémorisée, et le retry deviendrait inutile.

Par sécurité, notre `CachedQuote` ne mémorise jamais une erreur (test « une erreur n'est jamais
mémorisée »), mais l'ordre Cache(Retry) reste le bon : on met en cache uniquement ce qui a réussi,
au plus près de l'appelant.

## Vérifications

- `node --test seance4-patterns/tp4-andriamihamina/tp4.test.js` : 21 tests verts.
- `node seance4-patterns/tp4-andriamihamina/main.js` : sortie identique à celle de l'énoncé.
- `channels.js` ne contient pas le mot « slack » (vérifié par un test) ; `../tp4/carrierApis.js` n'est pas modifié.
