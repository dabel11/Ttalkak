import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";

const api = vi.hoisted(() => ({
  checkNickname: vi.fn(),
  checkUserId: vi.fn(),
  withdraw: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  load: vi.fn(async (_key, fallback) => fallback),
  remove: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined),
  sessionUuid: vi.fn(async () => "session-test"),
}));

vi.mock("../src/api/auth", () => ({
  requestCheckNickname: api.checkNickname,
  requestCheckUserId: api.checkUserId,
  requestFindId: vi.fn(),
  requestLogin: vi.fn(),
  requestPasswordReset: vi.fn(),
  requestSignup: vi.fn(),
  requestWithdrawAccount: api.withdraw,
}));
vi.mock("../src/storage/extensionStorage", () => ({
  getOrCreateSessionUuid: storage.sessionUuid,
  loadExtensionStorage: storage.load,
  removeExtensionStorage: storage.remove,
  saveExtensionStorage: storage.save,
}));

import { AuthModal } from "../src/components/AuthModal";
import { useAuth } from "../src/hooks/useAuth";
import { STORAGE } from "../src/constants";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSignup(overrides = {}) {
  const props = {
    mode: "signup",
    setMode: vi.fn(),
    onClose: vi.fn(),
    onLogin: vi.fn(),
    onSignup: vi.fn(),
    onFindId: vi.fn(),
    onPasswordReset: vi.fn(),
    onWithdraw: vi.fn(),
    onCheckDuplicate: vi.fn(),
    isLoggedIn: false,
    ...overrides,
  };
  render(createElement(AuthModal, props));
  return props;
}

async function completeSignupForm() {
  fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "nickname" } });
  fireEvent.click(screen.getByLabelText("닉네임").closest("label").querySelector("button"));
  await screen.findByText("사용 가능한 닉네임입니다.");
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: "Member" } });
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "member-id" } });
  fireEvent.click(screen.getByLabelText("아이디").closest("label").querySelector("button"));
  await screen.findByText("사용 가능한 아이디입니다.");
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "member@example.com" } });
  const passwordInputs = screen.getAllByLabelText(/비밀번호/);
  fireEvent.change(passwordInputs[0], { target: { value: "password123" } });
  fireEvent.change(passwordInputs[1], { target: { value: "password123" } });
  screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
}

describe("account withdrawal frontend policy", () => {
  test("withdrawal copy explains identifier retention, privacy handling, and local-data retention", () => {
    render(createElement(AuthModal, {
      mode: "withdraw", setMode: vi.fn(), onClose: vi.fn(), onLogin: vi.fn(), onSignup: vi.fn(),
      onFindId: vi.fn(), onPasswordReset: vi.fn(), onWithdraw: vi.fn(), onCheckDuplicate: vi.fn(), isLoggedIn: true,
    }));
    expect(screen.getByText(/사용한 아이디는 재가입에 사용할 수 없습니다/)).toBeTruthy();
    expect(screen.getByText(/기존 닉네임은 다른 계정에서 다시 사용할 수 있습니다/)).toBeTruthy();
    expect(screen.getByText(/개인정보는 탈퇴 정책에 따라 익명화 또는 삭제/)).toBeTruthy();
    expect(screen.getByText(/이 기기에만 저장된 대화와 보관함은 유지/)).toBeTruthy();
  });

  test("withdrawn user id is rejected while a released nickname is accepted", async () => {
    const onCheckDuplicate = vi.fn(async (field) => ({ available: field === "nickname" }));
    renderSignup({ onCheckDuplicate });

    fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "withdrawn-user" } });
    fireEvent.click(screen.getAllByRole("button", { name: "중복 확인" })[1]);
    expect(await screen.findByText("이미 사용 중인 아이디입니다.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "released-nickname" } });
    fireEvent.click(screen.getAllByRole("button", { name: "중복 확인" })[0]);
    expect(await screen.findByText("사용 가능한 닉네임입니다.")).toBeTruthy();
  });

  test("signup stays blocked until both duplicate checks have passed", async () => {
    const onSignup = vi.fn();
    renderSignup({ onSignup, onCheckDuplicate: vi.fn(async () => ({ available: true })) });
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "nickname" } });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "Member" } });
    fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "member-id" } });
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "member@example.com" } });
    const passwordInputs = screen.getAllByLabelText(/비밀번호/);
    fireEvent.change(passwordInputs[0], { target: { value: "password123" } });
    fireEvent.change(passwordInputs[1], { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(await screen.findByText("닉네임 중복 확인을 완료해주세요.")).toBeTruthy();
    expect(onSignup).not.toHaveBeenCalled();
  });

  test("signup preserves the backend duplicate-id error when availability changes after checking", async () => {
    const onSignup = vi.fn(async () => { throw new Error("이미 사용 중인 아이디입니다."); });
    renderSignup({ onSignup, onCheckDuplicate: vi.fn(async () => ({ available: true })) });
    await completeSignupForm();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(await screen.findByText("이미 사용 중인 아이디입니다.")).toBeTruthy();
    expect(onSignup).toHaveBeenCalledOnce();
  });

  test("successful withdrawal removes only the account session and preserves local collections", async () => {
    storage.load.mockImplementation(async (key, fallback) => key === STORAGE.AUTH ? { accessToken: "token", displayName: "member" } : fallback);
    api.withdraw.mockResolvedValue({ ok: true });
    const showNotice = vi.fn();
    const { result } = renderHook(() => useAuth({ ragConfig: {}, showNotice }));
    await waitFor(() => expect(result.current.authSession?.accessToken).toBe("token"));
    await act(async () => result.current.handleWithdraw("password"));
    expect(storage.remove).toHaveBeenCalledWith(STORAGE.AUTH);
    expect(storage.remove).not.toHaveBeenCalledWith(STORAGE.SAVED);
    expect(storage.remove).not.toHaveBeenCalledWith(STORAGE.RECENTS);
    expect(result.current.authSession).toBeNull();
  });
});
