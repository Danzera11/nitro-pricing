import {
  Bot,
  Brain,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FolderTree,
  LogOut,
  Layers3,
  ShieldCheck,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { api, apiBlob, clearAuthToken, LoginResponse, setAuthToken, AiPrompt, AuthUser, Customer, Group, MaterialKit, Quote, QuoteItem, QuoteMaterial, QuoteRequest, Rule, Service, Unit } from "./lib/api";

type View = "assistant" | "quote" | "control" | "users";
type ChatMessage = { role: "assistant" | "user"; text: string };

const starterPrompts = [
  "Orçamento para 30 câmeras IP com cabeamento e rack",
  "Criar regra: a partir de 20 câmeras sugerir switch PoE e nobreak",
  "Gerar orçamento para manutenção de rede com 12 pontos"
];

const roleOptions = [
  { value: "visualizador", label: "Visualizador" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" }
];

function hasRole(user: AuthUser | undefined, roles: string[]) {
  return Boolean(user?.roles.some((role) => roles.includes(role)));
}

function canEditQuotes(user?: AuthUser) {
  return hasRole(user, ["admin", "editor", "tecnico", "comercial", "gestor"]);
}

function isAdmin(user?: AuthUser) {
  return hasRole(user, ["admin"]);
}

export function App() {
  const [view, setView] = useState<View>("assistant");
  const [me, setMe] = useState<AuthUser>();
  const [authReady, setAuthReady] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [quickClient, setQuickClient] = useState({ name: "", phone: "", email: "" });
  const [quoteHistory, setQuoteHistory] = useState<QuoteRequest[]>([]);
  const [activeQuote, setActiveQuote] = useState<Quote>();
  const [activeRequest, setActiveRequest] = useState<QuoteRequest>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Descreva o que precisa orçar. Eu monto uma estimativa, aplico regras internas e deixo tudo pronto para revisão."
    }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bootstrapSession();
  }, []);

  async function bootstrapSession() {
    try {
      const user = await api<AuthUser>("/users/me");
      setMe(user);
      await Promise.all([refreshCustomers(), refreshQuotes()]);
    } catch {
      clearAuthToken();
      setMe(undefined);
    } finally {
      setAuthReady(true);
    }
  }

  async function handleLogin(email: string, password: string) {
    const result = await api<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: email, password })
    });
    setAuthToken(result.accessToken);
    setMe(result.user);
    await Promise.all([refreshCustomers(), refreshQuotes()]);
  }

  function handleLogout() {
    clearAuthToken();
    setMe(undefined);
    setActiveQuote(undefined);
    setActiveRequest(undefined);
    setMessages([{ role: "assistant", text: "Sessão encerrada. Faça login para continuar." }]);
  }

  async function refreshCustomers() {
    const data = await api<Customer[]>("/customers");
    setCustomers(data);
    setSelectedCustomerId((current) => current || data[0]?.id || "");
  }

  async function refreshQuotes() {
    const data = await api<QuoteRequest[]>("/quote-requests");
    setQuoteHistory(data.filter((request) => request.quote));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text }]);
    setBusy(true);

    try {
      if (activeQuote && isStatusCommand(text)) {
        if (!canEditQuotes(me)) throw new Error("Seu perfil permite visualizar orçamentos, mas não alterar status.");
        const status = statusFromText(text);
        const quote = await api<Quote>(`/quotes/${activeQuote.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        setActiveQuote({ ...activeQuote, status: quote.status });
        setMessages((current) => [...current, { role: "assistant", text: `Status atualizado para ${humanStatus(status)}.` }]);
        setView("quote");
        return;
      }

      if (isRuleCommand(text)) {
        if (!isAdmin(me)) throw new Error("Somente administradores podem criar regras para a IA.");
        const rule = await createRuleFromText(text);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            text: `Regra criada: quando a quantidade de câmeras for maior ou igual a ${rule.quantity}, vou sugerir ${rule.suggestions.join(", ")}.`
          }
        ]);
        setView("control");
        return;
      }

      if (isGreeting(text)) {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "Oi! Posso gerar orçamentos, explicar suas regras, listar configurações e ajudar a ajustar uma proposta. O que você quer fazer agora?" }
        ]);
        return;
      }

      if (isSystemQuestion(text)) {
        const answer = await answerSystemQuestion(text);
        setMessages((current) => [...current, { role: "assistant", text: answer }]);
        return;
      }

      if (!isQuoteRequest(text)) {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "Entendi. Para gerar um orçamento, me diga explicitamente o serviço e a quantidade. Exemplo: “orçamento para 20 câmeras IP com cabeamento”." }
        ]);
        return;
      }

      if (!canEditQuotes(me)) {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "Seu perfil é de visualização. Você pode pesquisar, abrir históricos e exportar PDFs, mas não criar novos orçamentos." }
        ]);
        return;
      }

      const quote = await generateQuoteFromText(text);
      setActiveQuote(quote);
      setActiveRequest(quote.request);
      refreshQuotes();
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `Gerei um orçamento com ${quote.items.length} itens e total estimado de ${money(quote.totalLaborPrice)} em mão de obra. Também registrei premissas e riscos para revisão.`
        }
      ]);
      setView("quote");
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: error instanceof Error ? error.message : "Não consegui concluir a ação. Tente descrever novamente." }
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function generateQuoteFromText(text: string) {
    const customer = await resolveCustomer();
    if (!customer) throw new Error("Cadastre um cliente antes de gerar o primeiro orçamento.");
    const cameraQuantity = extractQuantity(text, /(camera|câmera|cameras|câmeras)/i) ?? 8;
    const networkPoints = extractQuantity(text, /(ponto|pontos|rede|cabeamento)/i) ?? cameraQuantity;
    const apQuantity = extractQuantity(text, /(access point|\bap\b|wi-?fi|wifi)/i) ?? (/access point|\bap\b|wi-?fi|wifi/i.test(text) ? 1 : 0);
    const fiberMeters = extractQuantity(text, /(fibra|óptico|optico)/i) ?? 0;
    const alarmSensors = extractQuantity(text, /(sensor|alarme|sirene)/i) ?? 0;
    const request = await api<QuoteRequest>("/quote-requests", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.id,
        title: titleFromText(text, cameraQuantity),
        description: text,
        inputVariables: {
          camera_quantity: cameraQuantity,
          network_points: networkPoints,
          ap_quantity: apQuantity,
          fiber_meters: fiberMeters,
          alarm_sensor_quantity: alarmSensors,
          work_at_height: /altura|poste|aéreo|aereo|pta|plataforma|andaime/i.test(text),
          work_after_hours: /fora do horário|fora do horario|não comercial|nao comercial|noturno|fim de semana/i.test(text),
          outdoor_infra: /poste|externa|outdoor|eletroduto|condulete|aéreo|aereo/i.test(text)
        }
      })
    });
    const result = await api<{ quote: Quote }>(`/quote-requests/${request.id}/generate-ai`, { method: "POST" });
    return result.quote;
  }

  async function resolveCustomer() {
    if (quickClient.name.trim()) {
      const customer = await api<Customer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: quickClient.name.trim(),
          contactPhone: quickClient.phone.trim() || undefined,
          contactEmail: quickClient.email.trim() || undefined
        })
      });
      setQuickClient({ name: "", phone: "", email: "" });
      await refreshCustomers();
      setSelectedCustomerId(customer.id);
      return customer;
    }
    return customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0] ?? (await api<Customer[]>("/customers"))[0];
  }

  async function openQuoteFromHistory(request: QuoteRequest) {
    if (!request.quote) return;
    const quote = await api<Quote>(`/quotes/${request.quote.id}`);
    setActiveQuote(quote);
    setActiveRequest(request);
    setView("quote");
  }

  async function createRuleFromText(text: string) {
    const quantity = extractQuantity(text, /(camera|câmera|cameras|câmeras)/i) ?? 8;
    const suggestions = extractSuggestions(text);
    const code = `CHAT_CFTV_GTE_${quantity}_${Date.now()}`;
    await api("/rules", {
      method: "POST",
      body: JSON.stringify({
        code,
        name: `A partir de ${quantity} câmeras, sugerir ${suggestions.slice(0, 3).join(", ")}`,
        description: "Regra criada pelo chat do assistente.",
        conditionJson: { field: "camera_quantity", operator: ">=", value: quantity },
        actionJson: {
          suggest_groups: suggestions.filter((item) => ["RACK", "REDE", "NOBREAK"].includes(item.toUpperCase())).map((item) => item.toUpperCase()),
          suggest_materials: suggestions,
          suggest_kits: suggestions.some((item) => /camera/i.test(item)) ? ["KIT_CAMERA_IP_BASICO"] : [],
          add_notes: [`A partir de ${quantity} câmeras, considerar ${suggestions.join(", ")}.`]
        }
      })
    });
    return { quantity, suggestions };
  }

  async function answerSystemQuestion(text: string) {
    const [rules, units, services, kits] = await Promise.all([
      api<Rule[]>("/rules"),
      api<Unit[]>("/units"),
      api<Service[]>("/services"),
      api<MaterialKit[]>("/material-kits")
    ]);
    if (/regra/i.test(text)) return `Você tem ${rules.length} regras ativas. Exemplos: ${rules.slice(0, 3).map((rule) => rule.name).join("; ")}.`;
    if (/unidade/i.test(text)) return `Unidades disponíveis: ${units.map((unit) => unit.name).join(", ")}.`;
    if (/kit|material/i.test(text)) return `Você tem ${kits.length} kits de materiais. Materiais não têm preço e não impactam o total.`;
    return `A IA usa ${rules.length} regras, ${services.length} itens/serviços, ${units.length} unidades e ${kits.length} kits antes de gerar um orçamento.`;
  }

  if (!authReady) {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-card">
          <Sparkles size={22} />
          <h1>Nitro Pricing</h1>
          <p>Carregando ambiente interno...</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button className="brand-mark" onClick={() => setView("assistant")}>
          <Sparkles size={18} />
          <span>Nitro Pricing</span>
        </button>
        <nav className="top-nav">
          <button className={view === "assistant" ? "is-active" : ""} onClick={() => setView("assistant")}>
            <Bot size={16} /> Assistente
          </button>
          <button className={view === "quote" ? "is-active" : ""} onClick={() => setView("quote")}>
            <Table2 size={16} /> Orçamento
          </button>
          {isAdmin(me) && (
            <>
              <button className={view === "control" ? "is-active" : ""} onClick={() => setView("control")}>
                <Brain size={16} /> AI Control Center
              </button>
              <button className={view === "users" ? "is-active" : ""} onClick={() => setView("users")}>
                <ShieldCheck size={16} /> Usuários
              </button>
            </>
          )}
        </nav>
        <div className="session-pill">
          <strong>{me.name}</strong>
          <span>{me.roles.join(", ")}</span>
          <button className="logout-button" onClick={handleLogout}><LogOut size={14} /> Sair</button>
        </div>
      </header>

      {view === "assistant" && (
        <AssistantView
          messages={messages}
          input={input}
          busy={busy}
          activeQuote={activeQuote}
          onInput={setInput}
          onSubmit={handleSubmit}
          onPrompt={(prompt) => setInput(prompt)}
          onOpenQuote={() => setView("quote")}
          customers={customers}
          selectedCustomerId={selectedCustomerId}
          quickClient={quickClient}
          quoteHistory={quoteHistory}
          canEdit={canEditQuotes(me)}
          onSelectedCustomer={setSelectedCustomerId}
          onQuickClient={setQuickClient}
          onOpenHistory={openQuoteFromHistory}
          onDuplicateHistory={async (quoteId) => {
            const duplicated = await api<Quote>(`/quotes/${quoteId}/duplicate`, { method: "POST" });
            setActiveQuote(duplicated);
            setActiveRequest(duplicated.request);
            refreshQuotes();
            setView("quote");
          }}
          onExportHistory={async (quoteId) => {
            const blob = await apiBlob(`/quotes/${quoteId}/export.pdf`);
            const url = window.URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
          }}
        />
      )}

      {view === "quote" && (
        <QuoteWorkspace
          quote={activeQuote}
          request={activeRequest}
          onQuote={setActiveQuote}
          onDeleted={() => {
            setActiveQuote(undefined);
            setActiveRequest(undefined);
            setView("assistant");
          }}
          onRefreshQuotes={refreshQuotes}
          onBackToChat={() => setView("assistant")}
          canEdit={canEditQuotes(me)}
          canDelete={isAdmin(me)}
        />
      )}

      {view === "control" && (isAdmin(me) ? <AIControlCenter /> : <ForbiddenView onBack={() => setView("assistant")} />)}
      {view === "users" && (isAdmin(me) ? <UsersAdmin /> : <ForbiddenView onBack={() => setView("assistant")} />)}
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (login: string, password: string) => Promise<void> }) {
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(login.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-brand">
        <span className="eyebrow">Ambiente interno Nitro</span>
        <h1>Nitro Pricing</h1>
        <p>Orçamentos técnicos com IA, controle comercial e revisão operacional em uma interface segura para testes internos.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-lock"><Sparkles size={18} /></div>
        <h2>Acessar plataforma</h2>
        <p>Use o usuário local configurado na VM. A autenticação continua preparada para Keycloak/SSO no próximo ciclo.</p>
        <label>
          <span>Login</span>
          <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="admin" autoComplete="username" />
        </label>
        <label>
          <span>Senha</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" autoComplete="current-password" />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </main>
  );
}

function ForbiddenView({ onBack }: { onBack: () => void }) {
  return (
    <main className="workspace narrow">
      <div className="empty-state">
        <ShieldCheck size={30} />
        <h1>Acesso restrito</h1>
        <p>Este recurso é exclusivo para administradores.</p>
        <button className="primary" onClick={onBack}>Voltar ao assistente</button>
      </div>
    </main>
  );
}

function UsersAdmin() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState({ username: "", name: "", email: "", password: "", roles: ["editor"], active: true });

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const data = await api<AuthUser[]>("/users");
    setUsers(data);
  }

  function edit(user: AuthUser) {
    setSelectedId(user.id);
    setForm({
      username: user.username ?? "",
      name: user.name,
      email: user.email,
      password: "",
      roles: user.roles.filter((role) => ["admin", "editor", "visualizador"].includes(role)),
      active: user.active ?? true
    });
  }

  function toggleRole(role: string) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role]
    }));
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    const payload = {
      username: form.username,
      name: form.name,
      email: form.email,
      roles: form.roles.length ? form.roles : ["visualizador"],
      active: form.active
    };
    if (selectedId) {
      await api(`/users/${selectedId}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (form.password) await api(`/users/${selectedId}/password`, { method: "PATCH", body: JSON.stringify({ password: form.password }) });
    } else {
      await api("/users", { method: "POST", body: JSON.stringify({ ...payload, password: form.password }) });
    }
    setSelectedId(undefined);
    setForm({ username: "", name: "", email: "", password: "", roles: ["editor"], active: true });
    refresh();
  }

  async function disableUser(user: AuthUser) {
    if (!user.id) return;
    await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ active: !user.active }) });
    refresh();
  }

  return (
    <main className="workspace">
      <section className="knowledge-hero settings-hero">
        <div>
          <span className="eyebrow">Controle de acesso</span>
          <h1>Usuários e permissões</h1>
          <p>Gerencie usuários locais para testes internos. A base continua preparada para Keycloak/SSO futuramente.</p>
        </div>
      </section>
      <section className="users-layout">
        <form className="clean-panel user-form" onSubmit={saveUser}>
          <div className="section-title">
            <h2>{selectedId ? "Editar usuário" : "Novo usuário"}</h2>
            {selectedId && <button type="button" onClick={() => setSelectedId(undefined)}>Limpar</button>}
          </div>
          <input placeholder="Login, ex.: admin" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <input placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input placeholder="E-mail opcional" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input type="password" placeholder={selectedId ? "Nova senha, se quiser redefinir" : "Senha inicial"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <div className="role-picker">
            {roleOptions.map((role) => (
              <label key={role.value}>
                <input type="checkbox" checked={form.roles.includes(role.value)} onChange={() => toggleRole(role.value)} />
                <span>{role.label}</span>
              </label>
            ))}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Usuário ativo
          </label>
          <button className="primary">{selectedId ? "Salvar usuário" : "Criar usuário"}</button>
        </form>
        <div className="clean-panel">
          <div className="section-title">
            <h2>Usuários cadastrados</h2>
            <span>{users.length} contas</span>
          </div>
          <div className="user-list">
            {users.map((user) => (
              <article key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.username} · {user.email}</span>
                  <em>{user.roles.join(", ")} · {user.active ? "ativo" : "inativo"}</em>
                </div>
                <div className="row-actions">
                  <button onClick={() => edit(user)}>Editar</button>
                  <button className={user.active ? "danger-button" : ""} onClick={() => disableUser(user)}>{user.active ? "Desativar" : "Ativar"}</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function AssistantView(props: {
  messages: ChatMessage[];
  input: string;
  busy: boolean;
  activeQuote?: Quote;
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onPrompt: (prompt: string) => void;
  onOpenQuote: () => void;
  customers: Customer[];
  selectedCustomerId: string;
  quickClient: { name: string; phone: string; email: string };
  quoteHistory: QuoteRequest[];
  canEdit: boolean;
  onSelectedCustomer: (id: string) => void;
  onQuickClient: (client: { name: string; phone: string; email: string }) => void;
  onOpenHistory: (request: QuoteRequest) => void;
  onDuplicateHistory: (quoteId: string) => void;
  onExportHistory: (quoteId: string) => void;
}) {
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historySort, setHistorySort] = useState("recent");
  const [historyPage, setHistoryPage] = useState(0);
  const filteredHistory = props.quoteHistory.filter((request) => {
    const haystack = [
      request.quote?.quoteNumber,
      request.title,
      request.customer?.name,
      request.quote?.status,
      request.quote?.totalLaborPrice
    ].join(" ").toLowerCase();
    const matchesSearch = haystack.includes(historySearch.toLowerCase());
    const matchesStatus = historyStatus === "all" || (request.quote?.status ?? request.status) === historyStatus;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (historySort === "value") return Number(b.quote?.totalLaborPrice ?? 0) - Number(a.quote?.totalLaborPrice ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const pageSize = 8;
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const pageItems = filteredHistory.slice(historyPage * pageSize, historyPage * pageSize + pageSize);

  return (
    <main className="assistant-screen">
      <section className="hero-copy">
        <span className="eyebrow">Assistente operacional de orçamentos</span>
        <h1>Descreva o serviço. A IA monta o orçamento e explica as decisões.</h1>
        <p>
          Comece em linguagem natural. O sistema usa serviços, regras e kits cadastrados para gerar uma estimativa revisável.
        </p>
      </section>

      <section className="chat-card">
        <div className="chat-log">
          {props.messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <div className="avatar">{message.role === "assistant" ? <Sparkles size={16} /> : "Você"}</div>
              <p>{message.text}</p>
            </div>
          ))}
          {props.busy && (
            <div className="message assistant">
              <div className="avatar"><Sparkles size={16} /></div>
              <p>Consultando regras, kits e serviços cadastrados...</p>
            </div>
          )}
        </div>

        <div className="prompt-row">
          {starterPrompts.map((prompt) => (
            <button key={prompt} onClick={() => props.onPrompt(prompt)}>{prompt}</button>
          ))}
        </div>

        <form className="composer" onSubmit={props.onSubmit}>
          <textarea
            value={props.input}
            onChange={(event) => props.onInput(event.target.value)}
            placeholder="Ex.: orçamento para 30 câmeras IP, com cabeamento, rack e nobreak"
          />
          <button className="send-button" disabled={props.busy}>
            <Send size={18} /> Enviar
          </button>
        </form>
      </section>

      <aside className="assistant-side">
        <section className="side-section">
          <h2>Cliente</h2>
          <select value={props.selectedCustomerId} onChange={(event) => props.onSelectedCustomer(event.target.value)}>
            {props.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <div className="quick-client">
            <input placeholder="Novo cliente rápido" value={props.quickClient.name} onChange={(event) => props.onQuickClient({ ...props.quickClient, name: event.target.value })} />
            <input placeholder="Telefone opcional" value={props.quickClient.phone} onChange={(event) => props.onQuickClient({ ...props.quickClient, phone: event.target.value })} />
            <input placeholder="E-mail opcional" value={props.quickClient.email} onChange={(event) => props.onQuickClient({ ...props.quickClient, email: event.target.value })} />
          </div>
        </section>
        <h2>Resultado atual</h2>
        {props.activeQuote ? (
          <div className="quote-mini">
            <span className="status-dot">{humanStatus(props.activeQuote.status)}</span>
            <span className="quote-number-pill">{props.activeQuote.quoteNumber ?? "NP sem número"}</span>
            <strong>{money(props.activeQuote.totalLaborPrice)}</strong>
            <p>{props.activeQuote.scopeSummary}</p>
            <button onClick={props.onOpenQuote}>Revisar orçamento</button>
          </div>
        ) : (
          <div className="empty-soft">
            <Layers3 size={22} />
            <p>Nenhum orçamento ativo ainda. Peça algo ao assistente para começar.</p>
          </div>
        )}
        <section className="side-section">
          <h2>Orçamentos salvos</h2>
          <label className="history-search">
            <Search size={15} />
            <input placeholder="Buscar orçamento" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} />
          </label>
          <div className="history-filters">
            <select value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setHistoryPage(0); }}>
              <option value="all">Todos os status</option>
              <option value="SAVED">Salvos</option>
              <option value="EDITING">Em edição</option>
              <option value="EXPORTED">Exportados</option>
              <option value="AI_GENERATED">Gerados pela IA</option>
            </select>
            <select value={historySort} onChange={(event) => setHistorySort(event.target.value)}>
              <option value="recent">Mais recentes</option>
              <option value="value">Maior valor</option>
            </select>
          </div>
          <div className="history-list">
            {pageItems.map((request) => (
              <article className="history-card" key={request.id}>
                <button onClick={() => props.onOpenHistory(request)}>
                  <span>{request.quote?.quoteNumber ?? request.title}</span>
                  <strong>{request.customer?.name}</strong>
                  <em>{dateLabel(request.createdAt)} · {request.requestedBy?.name ?? "Equipe Nitro"} · {humanStatus(request.quote?.status ?? request.status)} · {money(request.quote?.totalLaborPrice ?? 0)}</em>
                </button>
                {request.quote && (
                  <div className="history-actions">
                    <button onClick={() => props.onOpenHistory(request)}>Abrir</button>
                    {props.canEdit && <button onClick={() => props.onDuplicateHistory(request.quote!.id)}>Duplicar</button>}
                    <button onClick={() => props.onExportHistory(request.quote!.id)}>PDF</button>
                  </div>
                )}
              </article>
            ))}
            {!filteredHistory.length && <p>Nenhum orçamento encontrado.</p>}
          </div>
          <div className="history-pagination">
            <button disabled={historyPage === 0} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>Anterior</button>
            <span>{historyPage + 1} / {historyPageCount}</span>
            <button disabled={historyPage + 1 >= historyPageCount} onClick={() => setHistoryPage((page) => Math.min(historyPageCount - 1, page + 1))}>Próxima</button>
          </div>
        </section>
      </aside>
    </main>
  );
}

function QuoteWorkspace(props: {
  quote?: Quote;
  request?: QuoteRequest;
  onQuote: (quote: Quote) => void;
  onDeleted: () => void;
  onRefreshQuotes: () => void;
  onBackToChat: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!props.quote) {
    return (
      <main className="workspace narrow">
        <div className="empty-state">
          <Sparkles size={30} />
          <h1>Nenhum orçamento em revisão</h1>
          <p>O grid aparece somente depois que a IA gera ou você seleciona um orçamento. Isso evita linhas soltas sem contexto.</p>
          <button className="primary" onClick={props.onBackToChat}>Abrir assistente</button>
        </div>
      </main>
    );
  }

  const quote = props.quote;

  async function setStatus(status: string) {
    const updated = await api<Quote>(`/quotes/${quote.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    const full = await api<Quote>(`/quotes/${updated.id}`);
    props.onQuote(full);
    props.onRefreshQuotes();
    setIsEditing(status === "EDITING");
  }

  async function duplicateQuote() {
    const duplicated = await api<Quote>(`/quotes/${quote.id}/duplicate`, { method: "POST" });
    props.onQuote(duplicated);
    props.onRefreshQuotes();
    setIsEditing(false);
  }

  async function deleteQuote() {
    await api(`/quotes/${quote.id}`, { method: "DELETE" });
    props.onRefreshQuotes();
    props.onDeleted();
  }

  async function exportPdf() {
    const blob = await apiBlob(`/quotes/${quote.id}/export.pdf`);
    const url = window.URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  }

  return (
    <main className="workspace">
      <section className="quote-context">
        <div>
          <span className="eyebrow">Orçamento em revisão</span>
          <h1>{quote.quoteNumber ?? "NP sem número"}</h1>
          <p>{props.request?.title ?? quote.request?.title ?? "Orçamento gerado pela IA"}</p>
          <p>{quote.scopeSummary}</p>
        </div>
        <div className="quote-total">
          <span>Cliente</span>
          <strong className="client-name">{quote.request?.customer?.name ?? props.request?.customer?.name ?? "Cliente"}</strong>
          <span>Data</span>
          <em>{dateLabel(quote.createdAt ?? quote.request?.createdAt ?? props.request?.createdAt)}</em>
          <span>Total mão de obra</span>
          <strong>{money(quote.totalLaborPrice)}</strong>
          <em>{humanStatus(quote.status)}</em>
        </div>
      </section>

      <section className="quote-actions">
        <div className="readonly-note">
          {isEditing ? "Modo edição ativo. Ajustes alteram o orçamento salvo." : "Orçamento em leitura. Clique em editar antes de alterar valores."}
        </div>
        <div>
          {!isEditing ? (
            props.canEdit && <button className="primary" onClick={() => setStatus("EDITING")}><Edit3 size={16} /> Editar</button>
          ) : (
            <button className="primary" onClick={() => setStatus("SAVED")}><Save size={16} /> Salvar</button>
          )}
          {props.canEdit && <button onClick={duplicateQuote}><Copy size={16} /> Duplicar</button>}
          <button onClick={exportPdf}><Download size={16} /> PDF</button>
          {props.canDelete && <button className="danger-button" onClick={deleteQuote}><Trash2 size={16} /> Excluir</button>}
        </div>
      </section>

      <section className="quote-layout">
        <div className="quote-main-stack">
          <QuoteGrid quote={quote} editable={isEditing} onQuote={props.onQuote} />
          <MaterialGrid quote={quote} editable={isEditing} onQuote={props.onQuote} />
        </div>
        <QuoteExplanation quote={quote} />
      </section>
    </main>
  );
}

function QuoteGrid({ quote, editable, onQuote }: { quote: Quote; editable: boolean; onQuote: (quote: Quote) => void }) {
  const [detailsId, setDetailsId] = useState<string>();

  async function patch(item: QuoteItem, field: keyof QuoteItem, value: string) {
    if (!editable) return;
    const payload = { [field]: ["quantity", "difficultyFactor", "unitLaborPrice"].includes(field) ? Number(value) : value };
    await api(`/quotes/${quote.id}/items/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    const updated = await api<Quote>(`/quotes/${quote.id}`);
    onQuote(updated);
  }

  async function removeItem(item: QuoteItem) {
    if (!editable || !window.confirm(`Excluir o serviço "${item.serviceName}"?`)) return;
    await api(`/quotes/${quote.id}/items/${item.id}`, { method: "DELETE" });
    const updated = await api<Quote>(`/quotes/${quote.id}`);
    onQuote(updated);
  }

  return (
    <div className="clean-panel">
      <div className="section-title">
        <h2>Itens do orçamento</h2>
        <span>{quote.items.length} serviços de mão de obra</span>
      </div>
      <div className="quote-items">
        {quote.items.map((item) => (
          <article className="quote-row" key={item.id}>
            <div className="quote-row-grid">
              <div className="grid-cell">
                <span>Categoria</span>
                <strong>{item.groupCode}</strong>
              </div>
              <div className="grid-cell item-name">
                <span>Item</span>
                {editable ? <input defaultValue={item.serviceName} onBlur={(event) => patch(item, "serviceName", event.target.value)} /> : <strong>{item.serviceName}</strong>}
              </div>
              <div className="grid-cell">
                <span>Quantidade</span>
                {editable ? <input type="number" defaultValue={Number(item.quantity)} onBlur={(event) => patch(item, "quantity", event.target.value)} /> : <strong>{Number(item.quantity)}</strong>}
              </div>
              <div className="grid-cell">
                <span>Unidade</span>
                {editable ? <input defaultValue={item.unit} onBlur={(event) => patch(item, "unit", event.target.value)} /> : <strong>{item.unit}</strong>}
              </div>
              <div className="grid-cell">
                <span>Valor unitário</span>
                {editable ? <input type="number" defaultValue={Number(item.unitLaborPrice)} onBlur={(event) => patch(item, "unitLaborPrice", event.target.value)} /> : <strong>{money(item.unitLaborPrice)}</strong>}
              </div>
              <div className="grid-cell total-cell">
                <span>Total</span>
                <strong>{money(item.totalLaborPrice)}</strong>
              </div>
              {editable && (
                <div className="grid-cell row-command-cell">
                  <span>Ação</span>
                  <button className="danger-button icon-action" onClick={() => removeItem(item)}><Trash2 size={15} /> Excluir</button>
                </div>
              )}
            </div>
            <button className="details-toggle" onClick={() => setDetailsId(detailsId === item.id ? undefined : item.id)}>
              {detailsId === item.id ? <X size={15} /> : <Settings2 size={15} />} Detalhes
            </button>
            {detailsId === item.id && (
              <div className="row-details">
                {editable ? <textarea defaultValue={item.description} onBlur={(event) => patch(item, "description", event.target.value)} /> : <p>{item.description}</p>}
                <InfoBlock label="Origem do valor" value="Base cadastrada + decisão da IA" />
                <InfoBlock label="Regra aplicada" value={item.notes || "Nenhuma regra específica informada."} />
                <InfoBlock label="Impacto no orçamento" value="Somente mão de obra entra no total." />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function MaterialGrid({ quote, editable, onQuote }: { quote: Quote; editable: boolean; onQuote: (quote: Quote) => void }) {
  const [detailsId, setDetailsId] = useState<string>();
  const [draft, setDraft] = useState({
    category: "Material",
    name: "",
    quantity: "1",
    unit: "unidade",
    status: "recomendado",
    technicalJustification: "",
    notes: ""
  });

  async function refresh() {
    const updated = await api<Quote>(`/quotes/${quote.id}`);
    onQuote(updated);
  }

  async function patch(material: QuoteMaterial, index: number, field: keyof QuoteMaterial, value: string) {
    if (!editable) return;
    const key = material.id ?? String(index);
    const payload = { [field]: field === "quantity" ? Number(value) : value };
    await api(`/quotes/${quote.id}/materials/${key}`, { method: "PATCH", body: JSON.stringify(payload) });
    refresh();
  }

  async function addMaterial() {
    if (!editable || !draft.name.trim()) return;
    await api(`/quotes/${quote.id}/materials`, {
      method: "POST",
      body: JSON.stringify({
        category: draft.category,
        name: draft.name.trim(),
        quantity: Number(draft.quantity || 1),
        unit: draft.unit,
        status: draft.status,
        technicalJustification: draft.technicalJustification,
        notes: draft.notes
      })
    });
    setDraft({ category: "Material", name: "", quantity: "1", unit: "unidade", status: "recomendado", technicalJustification: "", notes: "" });
    refresh();
  }

  async function removeMaterial(material: QuoteMaterial, index: number) {
    if (!editable || !window.confirm(`Excluir o material "${material.name}"?`)) return;
    const key = material.id ?? String(index);
    await api(`/quotes/${quote.id}/materials/${key}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="clean-panel">
      <div className="section-title">
        <h2>Materiais sugeridos</h2>
        <span>sem preço e sem impacto no total</span>
      </div>
      <div className="quote-items">
        {(quote.suggestedMaterials ?? []).map((material, index) => {
          const key = material.id ?? `${material.name}-${index}`;
          return (
            <article className="quote-row" key={key}>
              <div className="material-row-grid">
                <div className="grid-cell">
                  <span>Categoria</span>
                  {editable ? <input defaultValue={material.category ?? "Material"} onBlur={(event) => patch(material, index, "category", event.target.value)} /> : <strong>{material.category ?? "Material"}</strong>}
                </div>
                <div className="grid-cell item-name">
                  <span>Material</span>
                  {editable ? <input defaultValue={material.name} onBlur={(event) => patch(material, index, "name", event.target.value)} /> : <strong>{material.name}</strong>}
                </div>
                <div className="grid-cell">
                  <span>Quantidade</span>
                  {editable ? <input type="number" defaultValue={material.quantity} onBlur={(event) => patch(material, index, "quantity", event.target.value)} /> : <strong>{material.quantity}</strong>}
                </div>
                <div className="grid-cell">
                  <span>Unidade</span>
                  {editable ? <input defaultValue={material.unit} onBlur={(event) => patch(material, index, "unit", event.target.value)} /> : <strong>{material.unit}</strong>}
                </div>
                <div className="grid-cell">
                  <span>Status</span>
                  {editable ? (
                    <select defaultValue={material.status ?? "recomendado"} onBlur={(event) => patch(material, index, "status", event.target.value)}>
                      <option value="obrigatório">Obrigatório</option>
                      <option value="recomendado">Recomendado</option>
                      <option value="opcional">Opcional</option>
                    </select>
                  ) : <strong>{material.status ?? "recomendado"}</strong>}
                </div>
                {editable && (
                  <div className="grid-cell row-command-cell">
                    <span>Ação</span>
                    <button className="danger-button icon-action" onClick={() => removeMaterial(material, index)}><Trash2 size={15} /> Excluir</button>
                  </div>
                )}
              </div>
              <button className="details-toggle" onClick={() => setDetailsId(detailsId === key ? undefined : key)}>
                {detailsId === key ? <X size={15} /> : <Settings2 size={15} />} Detalhes
              </button>
              {detailsId === key && (
                <div className="row-details material-details">
                  <InfoBlock label="Serviço relacionado" value={material.relatedService ?? material.source ?? "Sugerido pela IA"} />
                  <label className="mini-field wide-field">
                    <span>Justificativa técnica</span>
                    {editable ? <textarea defaultValue={material.technicalJustification ?? material.source ?? ""} onBlur={(event) => patch(material, index, "technicalJustification", event.target.value)} /> : <p>{material.technicalJustification ?? material.source ?? "Sem justificativa registrada."}</p>}
                  </label>
                  <label className="mini-field wide-field">
                    <span>Observações</span>
                    {editable ? <textarea defaultValue={material.notes ?? ""} onBlur={(event) => patch(material, index, "notes", event.target.value)} /> : <p>{material.notes || "Sem observações."}</p>}
                  </label>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {editable && (
        <div className="material-add-panel">
          <div className="section-title">
            <h3>Adicionar material manualmente</h3>
            <span>quantitativo técnico</span>
          </div>
          <div className="material-add-grid">
            <input placeholder="Categoria" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
            <input placeholder="Material" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <input type="number" placeholder="Qtd." value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
            <input placeholder="Unidade" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              <option value="obrigatório">Obrigatório</option>
              <option value="recomendado">Recomendado</option>
              <option value="opcional">Opcional</option>
            </select>
            <textarea placeholder="Justificativa técnica" value={draft.technicalJustification} onChange={(event) => setDraft({ ...draft, technicalJustification: event.target.value })} />
            <textarea placeholder="Observações" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            <button className="primary" onClick={addMaterial}><Plus size={16} /> Adicionar material</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteExplanation({ quote }: { quote: Quote }) {
  return (
    <aside className="explain-panel">
      <div className="section-title">
        <h2>Explicação da IA</h2>
        <span>revisão técnica</span>
      </div>
      <InfoList title="Premissas" items={quote.assumptions} />
      <InfoList title="Riscos" items={quote.risks} />
      <div className="material-box">
        <h3>Materiais sugeridos</h3>
        <p>Materiais são apenas quantitativos e não impactam o total.</p>
        <div className="materials-list">
          {quote.suggestedMaterials?.length ? quote.suggestedMaterials.map((material) => (
            <span key={`${material.name}-${material.quantity}`}>{material.name}: {material.quantity} {material.unit}{material.source ? ` · ${material.source}` : ""}</span>
          )) : <span>Nenhum material sugerido.</span>}
        </div>
      </div>
      <div className="approval-box">
        <CheckCircle2 size={20} />
        <div>
          <strong>Pronto para ajuste</strong>
          <p>Edite quantidades e valores no grid. O total é recalculado no backend.</p>
        </div>
      </div>
    </aside>
  );
}

function AIControlCenter() {
  return (
    <>
      <main className="workspace">
        <section className="knowledge-hero settings-hero">
          <div>
            <span className="eyebrow">AI Control Center</span>
            <h1>Centro de comando da IA</h1>
            <p>Configure regras, grupos, itens, unidades e comportamento da IA em uma base única. A IA só deve usar o que está organizado aqui antes de gerar orçamentos.</p>
          </div>
        </section>
        <section className="control-grid">
          <div className="control-block">
            <strong>1. Knowledge</strong>
            <p>Regras estruturadas e kits que orientam decisões.</p>
          </div>
          <div className="control-block">
            <strong>2. Parameters</strong>
            <p>Grupos, itens e unidades padronizadas.</p>
          </div>
          <div className="control-block">
            <strong>3. AI Engine</strong>
            <p>Modo, modelo e comportamento operacional.</p>
          </div>
        </section>
      </main>
      <KnowledgeBase />
      <GeneralSettings />
      <main className="workspace">
        <AIEngineConfig />
      </main>
    </>
  );
}

function KnowledgeBase() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [kits, setKits] = useState<MaterialKit[]>([]);
  const [openBuilder, setOpenBuilder] = useState(false);
  const [form, setForm] = useState({
    code: "CFTV_GTE_30_CAMERAS",
    name: "A partir de 30 câmeras, sugerir rede dedicada",
    field: "camera_quantity",
    operator: ">=",
    value: "30",
    suggest_groups: "REDE,NOBREAK",
    suggest_materials: "Switch PoE 24 portas,Nobreak,Patch Panel",
    suggest_kits: "KIT_CAMERA_IP_BASICO",
    add_notes: "Projetos com 20 câmeras ou mais devem prever switch PoE dimensionado e energia protegida."
  });

  const refresh = () => {
    api<Rule[]>("/rules").then(setRules).catch(console.error);
    api<MaterialKit[]>("/material-kits").then(setKits).catch(console.error);
  };

  useEffect(refresh, []);

  async function createRule() {
    await api("/rules", {
      method: "POST",
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        description: "Regra criada pela Base IA.",
        conditionJson: { field: form.field, operator: form.operator, value: Number(form.value) },
        actionJson: {
          suggest_groups: csv(form.suggest_groups),
          suggest_materials: csv(form.suggest_materials),
          suggest_kits: csv(form.suggest_kits),
          add_notes: csv(form.add_notes)
        }
      })
    });
    setOpenBuilder(false);
    refresh();
  }

  return (
    <main className="workspace">
      <section className="knowledge-hero">
        <div>
          <span className="eyebrow">Base de conhecimento</span>
          <h1>O que a IA pode usar para decidir</h1>
          <p>Regras e kits ficam em linguagem humana. Detalhes técnicos aparecem apenas quando você abre opções avançadas.</p>
        </div>
        <button className="primary" onClick={() => setOpenBuilder((value) => !value)}>
          <Settings2 size={16} /> Nova regra
        </button>
      </section>

      {openBuilder && (
        <section className="clean-panel builder-panel">
          <div className="section-title">
            <h2>Criar regra guiada</h2>
            <span>sem escrever JSON</span>
          </div>
          <div className="builder-grid">
            <input placeholder="Nome da regra" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input placeholder="Código interno" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            <select value={form.field} onChange={(event) => setForm({ ...form, field: event.target.value })}>
              <option value="camera_quantity">Quantidade de câmeras</option>
              <option value="network_points">Pontos de rede</option>
              <option value="site_distance_km">Distância até o local</option>
            </select>
            <select value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })}>
              <option value=">=">for maior ou igual a</option>
              <option value=">">for maior que</option>
              <option value="==">for igual a</option>
              <option value="<=">for menor ou igual a</option>
            </select>
            <input type="number" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
            <input placeholder="Grupos sugeridos" value={form.suggest_groups} onChange={(event) => setForm({ ...form, suggest_groups: event.target.value })} />
            <input placeholder="Materiais sugeridos" value={form.suggest_materials} onChange={(event) => setForm({ ...form, suggest_materials: event.target.value })} />
            <input placeholder="Kits sugeridos" value={form.suggest_kits} onChange={(event) => setForm({ ...form, suggest_kits: event.target.value })} />
            <textarea placeholder="Nota que a IA deve explicar" value={form.add_notes} onChange={(event) => setForm({ ...form, add_notes: event.target.value })} />
          </div>
          <button className="primary" onClick={createRule}>Salvar na Base IA</button>
        </section>
      )}

      <section className="knowledge-layout">
        <div className="clean-panel">
          <div className="section-title">
            <h2>Regras ativas</h2>
            <span>{rules.length} orientações</span>
          </div>
          <div className="rule-list">
            {rules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}
          </div>
        </div>
        <div className="clean-panel">
          <div className="section-title">
            <h2>Kits sugeridos</h2>
            <span>{kits.length} conjuntos</span>
          </div>
          <div className="kit-list">
            {kits.map((kit) => <KitCard key={kit.id} kit={kit} />)}
          </div>
        </div>
      </section>
    </main>
  );
}

function GeneralSettings() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Service[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groupForm, setGroupForm] = useState({ code: "", name: "", description: "" });
  const [unitForm, setUnitForm] = useState({ code: "", name: "", description: "", example: "" });
  const [itemForm, setItemForm] = useState({ groupId: "", code: "", name: "", unit: "unidade", baseLaborPrice: "", description: "" });
  const [editingGroupId, setEditingGroupId] = useState<string>();
  const [editingItemId, setEditingItemId] = useState<string>();
  const [editingUnitId, setEditingUnitId] = useState<string>();

  const refresh = async () => {
    const [groupData, itemData, unitData] = await Promise.all([
      api<Group[]>("/groups"),
      api<Service[]>("/services"),
      api<Unit[]>("/units")
    ]);
    setGroups(groupData);
    setItems(itemData);
    setUnits(unitData);
    setItemForm((current) => ({
      ...current,
      groupId: current.groupId || groupData[0]?.id || "",
      unit: current.unit || unitData[0]?.code || "unidade"
    }));
  };

  useEffect(() => { refresh().catch(console.error); }, []);

  async function saveGroup() {
    await api(editingGroupId ? `/groups/${editingGroupId}` : "/groups", {
      method: editingGroupId ? "PATCH" : "POST",
      body: JSON.stringify(groupForm)
    });
    setGroupForm({ code: "", name: "", description: "" });
    setEditingGroupId(undefined);
    refresh();
  }

  async function saveUnit() {
    await api(editingUnitId ? `/units/${editingUnitId}` : "/units", {
      method: editingUnitId ? "PATCH" : "POST",
      body: JSON.stringify(unitForm)
    });
    setUnitForm({ code: "", name: "", description: "", example: "" });
    setEditingUnitId(undefined);
    refresh();
  }

  async function saveItem() {
    await api(editingItemId ? `/services/${editingItemId}` : "/services", {
      method: editingItemId ? "PATCH" : "POST",
      body: JSON.stringify({
        ...itemForm,
        baseLaborPrice: itemForm.baseLaborPrice ? Number(itemForm.baseLaborPrice) : 0,
        defaultDifficulty: 1
      })
    });
    setItemForm((current) => ({ ...current, code: "", name: "", baseLaborPrice: "", description: "" }));
    setEditingItemId(undefined);
    refresh();
  }

  function editGroup(group: Group) {
    setEditingGroupId(group.id);
    setGroupForm({ code: group.code, name: group.name, description: group.description ?? "" });
  }

  function editItem(item: Service) {
    setEditingItemId(item.id);
    setItemForm({
      groupId: item.group?.id ?? groups[0]?.id ?? "",
      code: item.code,
      name: item.name,
      unit: item.unit,
      baseLaborPrice: String(Number(item.baseLaborPrice ?? 0)),
      description: item.description ?? ""
    });
  }

  function editUnit(unit: Unit) {
    setEditingUnitId(unit.id);
    setUnitForm({ code: unit.code, name: unit.name, description: unit.description ?? "", example: unit.example ?? "" });
  }

  async function removeGroup(group: Group) {
    if (!window.confirm(`Excluir o grupo "${group.name}"?`)) return;
    await api(`/groups/${group.id}`, { method: "DELETE" });
    if (editingGroupId === group.id) {
      setEditingGroupId(undefined);
      setGroupForm({ code: "", name: "", description: "" });
    }
    refresh();
  }

  async function removeItem(item: Service) {
    if (!window.confirm(`Excluir o item "${item.name}"?`)) return;
    await api(`/services/${item.id}`, { method: "DELETE" });
    if (editingItemId === item.id) {
      setEditingItemId(undefined);
      setItemForm((current) => ({ ...current, code: "", name: "", baseLaborPrice: "", description: "" }));
    }
    refresh();
  }

  async function removeUnit(unit: Unit) {
    if (!window.confirm(`Excluir a unidade "${unit.name}"?`)) return;
    await api(`/units/${unit.id}`, { method: "DELETE" });
    if (editingUnitId === unit.id) {
      setEditingUnitId(undefined);
      setUnitForm({ code: "", name: "", description: "", example: "" });
    }
    refresh();
  }

  return (
    <main className="workspace">
      <section className="knowledge-hero settings-hero">
        <div>
          <span className="eyebrow">Configurações Gerais</span>
          <h1>A base que a IA lê antes de orçar</h1>
          <p>Organize grupos, itens e unidades em uma estrutura simples. Esses dados orientam a geração de orçamento e reduzem improvisos.</p>
        </div>
      </section>

      <section className="settings-grid">
        <ConfigCard
          icon={<FolderTree size={18} />}
          title="Grupos"
          description="Categorias que organizam os serviços e materiais. Exemplo: CFTV, Rede, Rack."
        >
          <div className="config-form">
            <input placeholder="Código curto, ex.: CFTV" value={groupForm.code} onChange={(event) => setGroupForm({ ...groupForm, code: event.target.value })} />
            <input placeholder="Nome visível, ex.: CFTV" value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} />
            <textarea placeholder="Descrição para orientar a IA" value={groupForm.description} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })} />
            <button className="primary" onClick={saveGroup}>{editingGroupId ? <Save size={16} /> : <Plus size={16} />} {editingGroupId ? "Salvar grupo" : "Adicionar grupo"}</button>
            {editingGroupId && <button onClick={() => { setEditingGroupId(undefined); setGroupForm({ code: "", name: "", description: "" }); }}><X size={16} /> Cancelar edição</button>}
          </div>
          <div className="editable-list">
            {groups.map((group) => (
              <article key={group.id} className={editingGroupId === group.id ? "is-editing" : ""}>
                <div>
                  <strong>{group.code} · {group.name}</strong>
                  {group.description && <p>{group.description}</p>}
                </div>
                <div className="row-actions">
                  <button onClick={() => editGroup(group)}><Edit3 size={15} /> Editar</button>
                  <button className="danger-button" onClick={() => removeGroup(group)}><Trash2 size={15} /> Excluir</button>
                </div>
              </article>
            ))}
          </div>
        </ConfigCard>

        <ConfigCard
          icon={<Table2 size={18} />}
          title="Itens"
          description="Serviços ou itens que a IA pode usar no orçamento. Cada item pertence a um grupo e usa uma unidade padronizada."
        >
          <div className="config-form item-config">
            <select value={itemForm.groupId} onChange={(event) => setItemForm({ ...itemForm, groupId: event.target.value })}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <input placeholder="Código, ex.: CFTV-INST-CAM" value={itemForm.code} onChange={(event) => setItemForm({ ...itemForm, code: event.target.value })} />
            <input placeholder="Nome, ex.: Instalação de câmera IP" value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} />
            <select value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })}>
              {units.map((unit) => <option key={unit.id} value={unit.code}>{unit.name}</option>)}
            </select>
            <input placeholder="Valor base opcional" type="number" value={itemForm.baseLaborPrice} onChange={(event) => setItemForm({ ...itemForm, baseLaborPrice: event.target.value })} />
            <textarea placeholder="Quando a IA deve considerar esse item?" value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} />
            <button className="primary" onClick={saveItem}>{editingItemId ? <Save size={16} /> : <Plus size={16} />} {editingItemId ? "Salvar item" : "Adicionar item"}</button>
            {editingItemId && <button onClick={() => { setEditingItemId(undefined); setItemForm((current) => ({ ...current, code: "", name: "", baseLaborPrice: "", description: "" })); }}><X size={16} /> Cancelar edição</button>}
          </div>
          <div className="item-list">
            {items.map((item) => (
              <article key={item.id} className={editingItemId === item.id ? "is-editing" : ""}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.group?.name ?? "Sem grupo"} · {unitName(units, item.unit)} · {money(item.baseLaborPrice)}</span>
                  <p>{item.description}</p>
                </div>
                <div className="row-actions">
                  <button onClick={() => editItem(item)}><Edit3 size={15} /> Editar</button>
                  <button className="danger-button" onClick={() => removeItem(item)}><Trash2 size={15} /> Excluir</button>
                </div>
              </article>
            ))}
          </div>
        </ConfigCard>

        <ConfigCard
          icon={<Settings2 size={18} />}
          title="Unidades"
          description="Unidades fixas e reutilizáveis. Elas aparecem em dropdowns e evitam escrita livre."
        >
          <div className="config-form">
            <input placeholder="Código, ex.: unidade" value={unitForm.code} onChange={(event) => setUnitForm({ ...unitForm, code: event.target.value })} />
            <input placeholder="Nome, ex.: Unidade" value={unitForm.name} onChange={(event) => setUnitForm({ ...unitForm, name: event.target.value })} />
            <input placeholder="Exemplo de uso" value={unitForm.example} onChange={(event) => setUnitForm({ ...unitForm, example: event.target.value })} />
            <textarea placeholder="Descrição clara para usuários e IA" value={unitForm.description} onChange={(event) => setUnitForm({ ...unitForm, description: event.target.value })} />
            <button className="primary" onClick={saveUnit}>{editingUnitId ? <Save size={16} /> : <Plus size={16} />} {editingUnitId ? "Salvar unidade" : "Adicionar unidade"}</button>
            {editingUnitId && <button onClick={() => { setEditingUnitId(undefined); setUnitForm({ code: "", name: "", description: "", example: "" }); }}><X size={16} /> Cancelar edição</button>}
          </div>
          <div className="unit-list">
            {units.map((unit) => (
              <article key={unit.id} className={editingUnitId === unit.id ? "is-editing" : ""}>
                <div>
                  <strong>{unit.name}</strong>
                  <p>{unit.description}</p>
                  {unit.example && <span>Ex.: {unit.example}</span>}
                </div>
                <div className="row-actions">
                  <button onClick={() => editUnit(unit)}><Edit3 size={15} /> Editar</button>
                  <button className="danger-button" onClick={() => removeUnit(unit)}><Trash2 size={15} /> Excluir</button>
                </div>
              </article>
            ))}
          </div>
        </ConfigCard>
      </section>
    </main>
  );
}

function AIEngineConfig() {
  const [prompt, setPrompt] = useState<AiPrompt>();
  const [promptForm, setPromptForm] = useState({ name: "", content: "", active: true });

  const loadPrompt = async () => {
    const data = await api<AiPrompt>("/ai-prompts/active");
    setPrompt(data);
    setPromptForm({ name: data.name, content: data.content, active: data.active });
  };

  useEffect(() => { loadPrompt().catch(console.error); }, []);

  async function savePrompt() {
    const data = await api<AiPrompt>("/ai-prompts/active", {
      method: "PATCH",
      body: JSON.stringify(promptForm)
    });
    setPrompt(data);
    setPromptForm({ name: data.name, content: data.content, active: data.active });
  }

  async function restorePrompt() {
    const data = await api<AiPrompt>("/ai-prompts/restore-default", { method: "POST" });
    setPrompt(data);
    setPromptForm({ name: data.name, content: data.content, active: data.active });
  }

  return (
    <section className="clean-panel engine-panel">
      <div className="section-title">
        <div>
          <h2>AI Engine Config</h2>
          <p>Configuração operacional. A chave fica somente no backend e nunca é exposta no navegador.</p>
        </div>
        <span>produção pronta para Keycloak/Traefik</span>
      </div>
      <div className="engine-grid">
        <article className="engine-card">
          <strong>Modo</strong>
          <select defaultValue="real">
            <option value="real">Real AI Mode com fallback seguro</option>
            <option value="mock">Mock Mode para desenvolvimento</option>
          </select>
          <p>Quando a API externa falha ou não tem cota, o sistema usa mock realista e registra o evento.</p>
        </article>
        <article className="engine-card">
          <strong>OpenAI</strong>
          <label>
            API Key
            <input value="Configurada no backend (.env)" readOnly />
          </label>
          <label>
            Modelo
            <input defaultValue="gpt-4.1-mini" />
          </label>
        </article>
        <article className="engine-card">
          <strong>Comportamento</strong>
          <label>
            Nível de detalhe
            <select defaultValue="balanced">
              <option value="short">Direto</option>
              <option value="balanced">Equilibrado</option>
              <option value="detailed">Detalhado</option>
            </select>
          </label>
          <label>
            Agressividade de sugestão
            <select defaultValue="moderate">
              <option value="low">Conservadora</option>
              <option value="moderate">Moderada</option>
              <option value="high">Proativa</option>
            </select>
          </label>
          <label>
            Sensibilidade a custo
            <select defaultValue="medium">
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </label>
        </article>
      </div>
      <div className="prompt-editor">
        <div className="section-title">
          <div>
            <h2>Prompt da IA</h2>
            <p>Instrução ativa lida antes da próxima geração. Alterações aqui não exigem rebuild nem acesso ao servidor.</p>
          </div>
          <span>v{prompt?.version ?? "-"} · atualizado {prompt ? dateLabel(prompt.updatedAt) : "-"}</span>
        </div>
        <div className="config-form">
          <input value={promptForm.name} onChange={(event) => setPromptForm({ ...promptForm, name: event.target.value })} placeholder="Nome do prompt" />
          <label className="check-row">
            <input type="checkbox" checked={promptForm.active} onChange={(event) => setPromptForm({ ...promptForm, active: event.target.checked })} />
            Ativo para as próximas respostas da IA
          </label>
          <textarea className="prompt-textarea" value={promptForm.content} onChange={(event) => setPromptForm({ ...promptForm, content: event.target.value })} />
          <div className="row-actions prompt-actions">
            <button className="primary" onClick={savePrompt}><Save size={16} /> Salvar prompt</button>
            <button onClick={restorePrompt}>Restaurar padrão</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConfigCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="clean-panel config-card">
      <div className="config-head">
        <div className="config-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  const condition = rule.conditionJson as { field?: string; operator?: string; value?: number };
  const action = rule.actionJson as { suggest_groups?: string[]; suggest_materials?: string[]; suggest_kits?: string[]; add_notes?: string[] };
  return (
    <article className="knowledge-card">
      <div>
        <strong>{rule.name}</strong>
        <p>Quando {fieldLabel(condition.field)} {operatorLabel(condition.operator)} {condition.value}, a IA deve sugerir reforços no orçamento.</p>
      </div>
      <div className="tag-row">
        {[...(action.suggest_groups ?? []), ...(action.suggest_materials ?? []), ...(action.suggest_kits ?? [])].slice(0, 8).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {action.add_notes?.[0] && <em>{action.add_notes[0]}</em>}
    </article>
  );
}

function KitCard({ kit }: { kit: MaterialKit }) {
  return (
    <article className="knowledge-card compact">
      <strong>{kit.name}</strong>
      <p>{kit.description}</p>
      <div className="kit-items">
        {(kit.itemsJson.items ?? []).map((item) => (
          <span key={`${kit.id}-${item.material}`}>{item.material}</span>
        ))}
      </div>
    </article>
  );
}

function LabeledInput(props: { label: string; value: string | number; step?: string; onBlur: (value: string) => void }) {
  return (
    <label className="mini-field">
      <span>{props.label}</span>
      <input
        type={typeof props.value === "number" ? "number" : "text"}
        step={props.step}
        defaultValue={props.value}
        onBlur={(event) => props.onBlur(event.target.value)}
      />
    </label>
  );
}

function InfoBlock({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="info-block">
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <p>{value}</p>}
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="info-list">
      <h3>{title}</h3>
      {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>Nenhum ponto registrado.</p>}
    </div>
  );
}

function extractQuantity(text: string, nearby: RegExp) {
  const matches = [...text.matchAll(/(\d+)/g)];
  const hasContext = nearby.test(text);
  if (!hasContext || !matches.length) return undefined;
  return Number(matches[0][1]);
}

function titleFromText(text: string, cameras: number) {
  if (/camera|câmera/i.test(text)) return `Orçamento para ${cameras} câmeras`;
  return text.slice(0, 64);
}

function isStatusCommand(text: string) {
  return /(aprovar|rejeitar|enviar|revisão|revisao)/i.test(text);
}

function isRuleCommand(text: string) {
  return /(criar|nova|definir|cadastrar).{0,24}regra|regra.{0,24}(sugerir|recomendar|adicionar)/i.test(text);
}

function isGreeting(text: string) {
  return /^(oi|olá|ola|bom dia|boa tarde|boa noite|hello|hi)\b/i.test(text.trim());
}

function isSystemQuestion(text: string) {
  return /(quais|listar|mostrar|minhas|meus|ver).*(regras|unidades|itens|serviços|servicos|kits|materiais)|como.*config/i.test(text);
}

function isQuoteRequest(text: string) {
  return /(orçamento|orcamento|estimar|estimativa|cotação|cotacao|proposta|quanto fica|gerar).*(camera|câmera|rede|rack|cabeamento|nobreak|manutenção|manutencao|ponto|infra|fibra|fusão|fusao|access point|\bap\b|alarme|sensor|poste)|\d+.*(camera|câmera|cameras|câmeras|pontos|access point|\bap\b|sensores|metros|m de fibra)/i.test(text);
}

function extractSuggestions(text: string) {
  const match = text.match(/(?:sugerir|recomendar|adicionar|incluir)\s+(.+)$/i);
  const raw = match?.[1] ?? "Rack, Switch, Nobreak";
  return raw
    .replace(/\s+e\s+/gi, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function statusFromText(text: string) {
  if (/aprovar/i.test(text)) return "APPROVED";
  if (/rejeitar/i.test(text)) return "REJECTED";
  if (/enviar/i.test(text)) return "SENT";
  return "TECH_REVIEW";
}

function humanStatus(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    AI_GENERATED: "Gerado pela IA",
    EDITING: "Em edição",
    SAVED: "Salvo",
    EXPORTED: "Exportado",
    TECH_REVIEW: "Em revisão técnica",
    APPROVED: "Aprovado",
    REJECTED: "Rejeitado",
    SENT: "Enviado"
  };
  return labels[status] ?? status;
}

function money(value: string | number) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function unitName(units: Unit[], code: string) {
  return units.find((unit) => unit.code === code)?.name ?? code;
}

function fieldLabel(field?: string) {
  const labels: Record<string, string> = {
    camera_quantity: "a quantidade de câmeras",
    network_points: "os pontos de rede",
    site_distance_km: "a distância"
  };
  return labels[field ?? ""] ?? "o campo informado";
}

function operatorLabel(operator?: string) {
  const labels: Record<string, string> = {
    ">": "for maior que",
    ">=": "for maior ou igual a",
    "<": "for menor que",
    "<=": "for menor ou igual a",
    "==": "for igual a"
  };
  return labels[operator ?? ""] ?? "atender";
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
