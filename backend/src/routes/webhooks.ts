import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { verifyWebhookSignature } from "../utils/crypto.js";
import {
  getPaymentByProviderReference,
  markPixPaymentSucceeded,
} from "../services/payments.js";
import { decideWebhookAction } from "../services/provider-events.js";
import { notifyAfterPixConfirmed } from "../services/payments-queries-notify.js";
import {
  applyKycApproved,
  applyKycRejected,
  findOrgIdByKycProviderIds,
} from "../services/kyc.js";

const router = Router();
