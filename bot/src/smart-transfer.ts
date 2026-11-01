// Payment screenshots require review; they are not bank verification.
import type {ImageAnalysis} from './image-analyzer'
import type {UserContext} from '../types'

export async function handleIncomingPayment(
  analysis: ImageAnalysis,
  user: UserContext
): Promise<string> {
  return 'I can read payment proof, but a screenshot cannot verify that money reached your account. Please confirm the payment in Income before recording it. No payment or client balance has been changed.'
}
