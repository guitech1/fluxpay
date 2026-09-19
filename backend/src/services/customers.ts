import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { inScopeOrNull } from "../utils/scope.js";
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

/**
 * Busca um cliente da organizacao DENTRO do ambiente da chave.
 *
 * Sem o filtro de ambiente, uma chave sk_test_ lia cadastros de producao da
 * mesma empresa (nome, e-mail, telefone, documento) — a separacao test/live
 * vale para os dados pessoais tanto quanto para o dinheiro.
 */
export async function getCustomer(
  organizationId: string,
  customerId: string,
  environment: Environment
): Promise<Customer> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  const customer = inScopeOrNull(data as Customer | null, organizationId, environment);

  if (error || !customer) {
    throw new AppError(404, "not_found", "Cliente nao encontrado.");
  }

  return customer;
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

/**
 * Atualiza um cliente DENTRO da organizacao e do ambiente.
 *
 * Existe porque o painel fazia esse update direto pelo Supabase client, com
 * `.eq("id", ...)` apenas: a RLS confere se a pessoa e da empresa, mas nao
 * sabe qual ambiente o painel esta mostrando. Um id do outro ambiente da
 * mesma empresa era gravavel. A validacao de organizacao + ambiente + id
 * passa a acontecer aqui, no servidor.
 */
export async function updateCustomer(
  organizationId: string,
  customerId: string,
  environment: Environment,
  input: CreateCustomerInput
): Promise<Customer> {
  // Confere o escopo ANTES de escrever: 404 quando o cliente nao e deste
  // ambiente, sem revelar que o id existe em outro lugar.
  await getCustomer(organizationId, customerId, environment);

  const { data, error } = await supabaseAdmin
    .from("customers")
    .update({
      email: input.email ?? null,
      name: input.name ?? null,
      phone: input.phone ?? null,
      document: input.document ?? null,
      external_id: input.external_id ?? null,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(500, "api_error", "Nao foi possivel salvar o cliente. Tente novamente.");
  }

  return data as Customer;
}

/** Remove um cliente DENTRO da organizacao e do ambiente. */
export async function deleteCustomer(
  organizationId: string,
  customerId: string,
  environment: Environment
): Promise<void> {
  await getCustomer(organizationId, customerId, environment);

  const { error } = await supabaseAdmin
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .eq("environment", environment);

  if (error) {
    // O caso comum e o cliente ter cobranca vinculada (FK ON DELETE SET NULL
    // em payments, mas outras referencias podem barrar).
    throw new AppError(
      409,
      "invalid_request",
      "Nao foi possivel excluir este cliente. Verifique se ele tem cobrancas vinculadas."
    );
  }
}
