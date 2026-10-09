import { describe, it, expect, vi, beforeEach } from "vitest";
import "../api/setup";
import { GET, POST } from "@/app/api/clients/route";
import { GET as GET_BY_ID, PUT, DELETE } from "@/app/api/clients/[id]/route";
import { GET as SEARCH } from "@/app/api/clients/search/route";
import {
  getClients,
  createClient,
  getClientById,
  updateClient,
  deactivateClient,
  searchClients,
} from "@/lib/services";
import {
  ClientNotFoundError,
  DuplicateDocumentError,
  InvalidClientDataError,
} from "@/lib/errors";

// ============================================
// Helper: crear Request mock
// ============================================
function makeRequest(
  url: string,
  options: { method?: string; body?: object } = {}
): Request {
  return new Request(url, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

const mockClient = {
  collectionDays: [],
  id: "client-1",
  firstName: "Juan",
  lastName: "Pérez",
  documentId: "00112345678",
  phone: "8091234567",
  email: "juan@test.com",
  address: "Calle Principal 123",
  currency: "DOP",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPaginatedClients = {
  data: [mockClient],
  pagination: {
    total: 1, page: 1, limit: 20,
    totalPages: 1, hasNext: false, hasPrev: false,
  },
};

// ============================================
// GET /api/clients
// ============================================

describe("GET /api/clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista paginada de clientes", async () => {
    vi.mocked(getClients).mockResolvedValue(mockPaginatedClients);

    const req = makeRequest("http://localhost/api/clients");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("pasa parámetros de búsqueda al servicio", async () => {
    vi.mocked(getClients).mockResolvedValue(mockPaginatedClients);

    const req = makeRequest("http://localhost/api/clients?search=Juan&page=2&limit=10");
    await GET(req);

    expect(getClients).toHaveBeenCalledWith(
      expect.objectContaining({ search: "Juan" }),
      expect.objectContaining({ page: 2, limit: 10 })
    );
  });

  it("retorna 401 sin sesión", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const req = makeRequest("http://localhost/api/clients");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

// ============================================
// POST /api/clients
// ============================================

describe("POST /api/clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea un cliente y retorna 201", async () => {
    vi.mocked(createClient).mockResolvedValue(mockClient);

    const req = makeRequest("http://localhost/api/clients", {
      method: "POST",
      body: {
        firstName: "Juan",
        lastName: "Pérez",
        documentId: "00112345678",
        phone: "8091234567",
      },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("client-1");
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("retorna 409 cuando cédula ya existe", async () => {
    vi.mocked(createClient).mockRejectedValue(
      new DuplicateDocumentError("00112345678")
    );

    const req = makeRequest("http://localhost/api/clients", {
      method: "POST",
      body: { firstName: "Juan", documentId: "00112345678", phone: "8091234567" },
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
  });

  it("retorna 400 cuando datos son inválidos", async () => {
    vi.mocked(createClient).mockRejectedValue(
      new InvalidClientDataError("El nombre debe tener al menos 2 caracteres")
    );

    const req = makeRequest("http://localhost/api/clients", {
      method: "POST",
      body: { firstName: "J", documentId: "00112345678", phone: "8091234567" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});

// ============================================
// GET /api/clients/[id]
// ============================================

describe("GET /api/clients/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna el cliente por ID", async () => {
    vi.mocked(getClientById).mockResolvedValue({ ...mockClient, loans: [] });

    const req = makeRequest("http://localhost/api/clients/client-1");
    const context = { params: Promise.resolve({ id: "client-1" }) };
    const res = await GET_BY_ID(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("client-1");
  });

  it("retorna 404 cuando cliente no existe", async () => {
    vi.mocked(getClientById).mockRejectedValue(
      new ClientNotFoundError("non-existent")
    );

    const req = makeRequest("http://localhost/api/clients/non-existent");
    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const res = await GET_BY_ID(req, context);

    expect(res.status).toBe(404);
  });
});

// ============================================
// PUT /api/clients/[id]
// ============================================

describe("PUT /api/clients/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("actualiza el cliente correctamente", async () => {
    const updatedClient = { ...mockClient, firstName: "Carlos" };
    vi.mocked(updateClient).mockResolvedValue(updatedClient);

    const req = makeRequest("http://localhost/api/clients/client-1", {
      method: "PUT",
      body: { firstName: "Carlos" },
    });
    const context = { params: Promise.resolve({ id: "client-1" }) };
    const res = await PUT(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.firstName).toBe("Carlos");
  });

  it("retorna 404 cuando cliente no existe", async () => {
    vi.mocked(updateClient).mockRejectedValue(
      new ClientNotFoundError("non-existent")
    );

    const req = makeRequest("http://localhost/api/clients/non-existent", {
      method: "PUT",
      body: { firstName: "Carlos" },
    });
    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const res = await PUT(req, context);

    expect(res.status).toBe(404);
  });
});

// ============================================
// DELETE /api/clients/[id]
// ============================================

describe("DELETE /api/clients/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("desactiva el cliente correctamente", async () => {
    vi.mocked(deactivateClient).mockResolvedValue({ ...mockClient, active: false });

    const req = makeRequest("http://localhost/api/clients/client-1", {
      method: "DELETE",
    });
    const context = { params: Promise.resolve({ id: "client-1" }) };
    const res = await DELETE(req, context);

    expect(res.status).toBe(200);
  });
});

// ============================================
// GET /api/clients/search
// ============================================

describe("GET /api/clients/search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna resultados de búsqueda", async () => {
    vi.mocked(searchClients).mockResolvedValue([
      { id: "client-1", firstName: "Juan", lastName: "Pérez",
        documentId: "00112345678", phone: "8091234567" },
    ]);

    const req = makeRequest("http://localhost/api/clients/search?q=Juan&limit=5");
    const res = await SEARCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(searchClients).toHaveBeenCalledWith("Juan", 5);
  });

  it("retorna array vacío para búsqueda sin resultados", async () => {
    vi.mocked(searchClients).mockResolvedValue([]);

    const req = makeRequest("http://localhost/api/clients/search?q=xyz");
    const res = await SEARCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(0);
  });
});
