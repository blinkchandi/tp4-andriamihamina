// Facade : une seule méthode simple pour le reste de l'application.
// Elle cache le parallélisme, les pannes et la comparaison des devis.
export class ShippingService {
  constructor(carriers) {
    this.carriers = carriers; // transporteurs déjà adaptés (getQuote) et décorés
  }

  // Le devis le moins cher ; à prix égal, le plus rapide.
  async bestQuote(parcel) {
    const results = await Promise.allSettled(this.carriers.map(c => c.getQuote(parcel)));
    const quotes = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (quotes.length === 0) throw new Error('Aucun transporteur disponible');
    return quotes.reduce((best, q) =>
      q.price < best.price || (q.price === best.price && q.days < best.days) ? q : best);
  }
}
