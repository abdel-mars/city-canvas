import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRoute } from "@/components/AdminRoute";

const auth = vi.hoisted(() => ({
  loading: false,
  isAdmin: false,
  user: null as { email?: string } | null,
  logout: vi.fn(async () => {}),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth,
}));

vi.mock("@/components/AuthModal", () => ({
  AuthModal: () => null,
}));

describe("AdminRoute", () => {
  beforeEach(() => {
    auth.loading = false;
    auth.isAdmin = false;
    auth.user = null;
    auth.logout.mockClear();
  });

  afterEach(cleanup);

  it("offers sign in when signed out", () => {
    render(
      <AdminRoute>
        <div>studio content</div>
      </AdminRoute>,
    );

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText("studio content")).not.toBeInTheDocument();
  });

  it("shows the signed-in account and a sign-out action for non-admins", () => {
    auth.user = { email: "someone@example.com" };

    render(
      <AdminRoute>
        <div>studio content</div>
      </AdminRoute>,
    );

    expect(screen.getByText("someone@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByText("studio content")).not.toBeInTheDocument();
  });

  it("renders children for admins", () => {
    auth.isAdmin = true;
    auth.user = { email: "elmahmoudiabderrahmane@gmail.com" };

    render(
      <AdminRoute>
        <div>studio content</div>
      </AdminRoute>,
    );

    expect(screen.getByText("studio content")).toBeInTheDocument();
  });
});
