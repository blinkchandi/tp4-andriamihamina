// Decorator : chaque classe a EXACTEMENT l'interface getQuote(parcel) et enveloppe un objet qui l'a aussi.
// On peut donc les empiler : new CachedQuote(new RetryQuote(new DhlAdapter(client))).

// Réessaie en cas d'erreur ; relance la dernière erreur après `attempts` échecs.
export class RetryQuote {
  constructor(inner, { attempts = 3 } = {}) {
    this.inner = inner;
    this.attempts = attempts;
  }

  async getQuote(parcel) {
    let lastError;
    for (let i = 1; i <= this.attempts; i++) {
      try {
        return await this.inner.getQuote(parcel);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

// Mémorise le devis par « poids|code postal » pendant ttlMs ; seuls les SUCCÈS sont mémorisés.
// `now` est injectable pour tester l'expiration sans attendre.
export class CachedQuote {
  #entries = new Map();

  constructor(inner, { ttlMs = 60000, now = Date.now } = {}) {
    this.inner = inner;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async getQuote(parcel) {
    const key = `${parcel.weightKg}|${parcel.zip}`;
    const entry = this.#entries.get(key);
    if (entry && this.now() < entry.expiresAt) return entry.quote;

    const quote = await this.inner.getQuote(parcel); // une erreur remonte sans rien mémoriser
    this.#entries.set(key, { quote, expiresAt: this.now() + this.ttlMs });
    return quote;
  }
}
