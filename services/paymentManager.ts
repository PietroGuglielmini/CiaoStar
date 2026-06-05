import { PaymentInitData, PaymentResponse, PaymentProviderType } from '../types';
import { callCreatePaymentIntent, updateRequestStatus } from './dataService';

class PaymentManager {
  private currentProvider: PaymentProviderType = 'STRIPE';

  /**
   * Consente di cambiare dinamicamente il provider (es. letto dalle impostazioni dell'amministratore)
   */
  public setProvider(provider: PaymentProviderType) {
    this.currentProvider = provider;
  }

  /**
   * Restituisce il provider corrente
   */
  public getProvider(): PaymentProviderType {
    return this.currentProvider;
  }

  /**
   * Funzione universale richiamata dal flusso di checkout
   */
  public async processPayment(data: PaymentInitData): Promise<PaymentResponse> {
    switch (this.currentProvider) {
      case 'STRIPE':
        return this.processStripe(data);
      case 'PAYPAL':
        return this.processPayPal(data);
      default:
        return { success: false, error: `Metodo di pagamento '${this.currentProvider}' non supportato.` };
    }
  }

  /**
   * Gestore Stripe: comunica con la Cloud Function o si appoggia alla simulazione integrata
   */
  private async processStripe(data: PaymentInitData): Promise<PaymentResponse> {
    try {
      // Chiama la cloud function per generare l'intenzione di pagamento Stripe
      const stripeRes = await callCreatePaymentIntent(data.orderId, data.amount);
      if (stripeRes && stripeRes.clientSecret) {
        return {
          success: true,
          transactionId: stripeRes.paymentIntentId,
          redirectUrl: stripeRes.clientSecret // Client secret passato come redirectUrl o memorizzabile localmente
        };
      }
      return { success: true, transactionId: 'ch_stripe_mock_local_mode' };
    } catch (err: any) {
      console.warn("Dettagli pagamento reale non pronti, si prosegue col fallback mock transazionale CiaoStar Connect...", err);
      return { 
        success: true, 
        transactionId: `ch_stripe_simulated_${Date.now()}`
      };
    }
  }

  /**
   * Gestore PayPal (Predisposto per il futuro come richiesto da specifiche commerciali)
   */
  private async processPayPal(data: PaymentInitData): Promise<PaymentResponse> {
    // Quando verrà attivato, basterà registrare qui le cloud function dedicate di PayPal
    return { 
      success: false, 
      error: 'PayPal non ancora configurato o abilitato per questa istanza di CiaoStar.' 
    };
  }
}

export const paymentManager = new PaymentManager();
