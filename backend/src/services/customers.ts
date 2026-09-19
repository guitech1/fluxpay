import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import type { CreateCustomerInput, Customer, Environment } from "../types/index.js";

export async function createCustomer(
  organizationId: string,
  environment: Environment,
  input: CreateCustomerInput
): Promise<Customer> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({
      id: uuidv4(),
      organization_id: organizationId,
      environment,
      email: input.email || null,
      name: input.name || null,
      phone: input.phone || null,
      document: input.document || null,
      external_id: input.external_id || null,
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error("Create customer error:", error);
    throw new AppError(500, "api_error", "Nao foi possivel salvar o cliente. Tente novamente.");
  }

  return data as Customer;
}

export async function getCustomer(
  organizationId: string,
  customerId: string
): Promise<Customer> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(404, "not_found", "Cliente nao encontrado.");
  }

  return data as Customer;
}

export async function listCustomers(
  organizationId: string,
  environment: Environment,
  options: { limit?: number } = {}
): Promise<{ data: Customer[] }> {
  const limit = Math.min(options.limit || 20, 100);

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel carregar os clientes.");
  }

  return { data: (data || []) as Customer[] };
}
