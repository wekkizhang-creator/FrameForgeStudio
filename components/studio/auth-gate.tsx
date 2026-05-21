"use client";

import { type ReactNode, useState } from "react";
import { Film, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useUserAuthStore } from "@/store/user-auth-store";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const currentUser = useUserAuthStore((state) => state.currentUser());
  const login = useUserAuthStore((state) => state.login);
  const register = useUserAuthStore((state) => state.register);
  const loginError = useUserAuthStore((state) => state.loginError);
  const clearError = useUserAuthStore((state) => state.clearError);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@guangying.ai");
  const [password, setPassword] = useState("123456");
  const [name, setName] = useState("光影创作者");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (currentUser) {
    return <>{children}</>;
  }

  const isRegister = mode === "register";

  const submit = () => {
    clearError();
    if (isRegister) {
      if (password !== confirmPassword) {
        useUserAuthStore.setState({ loginError: "两次输入的密码不一致。" });
        return;
      }
      register({ email, password, name });
      return;
    }
    login({ email, password });
  };

  return (
    <main className="panel-grid flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border/70 bg-surface/85 shadow-soft backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[560px] overflow-hidden border-r border-border/70 p-8 md:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(168,85,247,0.28),transparent_34%),radial-gradient(circle_at_80%_75%,rgba(236,72,153,0.18),transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs text-white/75">
                <Sparkles className="h-3.5 w-3.5" />
                AI 视频创作工作台
              </div>
              <h1 className="mt-8 text-4xl font-semibold leading-tight">
                光影造物
                <span className="mt-3 block text-xl text-muted-foreground">
                  从灵感、分镜到合成导出的创作空间
                </span>
              </h1>
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                项目下可创建多条生成记录，独立保存脚本、分镜和本地素材。
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                注册登录后进入个人工作台，后续可扩展团队、套餐和权限。
              </div>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow-sm">
              <Film className="h-4 w-4" />
            </div>
            <div>
              <div className="text-base font-semibold">光影造物</div>
              <div className="text-xs text-muted-foreground">用户账号体系</div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => {
                clearError();
                setMode("login");
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                !isRegister ? "bg-primary/18 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => {
                clearError();
                setMode("register");
                setPassword("");
                setConfirmPassword("");
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isRegister ? "bg-primary/18 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              注册
            </button>
          </div>

          <div className="space-y-4">
            {isRegister && (
              <div>
                <Label htmlFor="auth-name">昵称</Label>
                <Input
                  id="auth-name"
                  className="mt-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="请输入你的昵称"
                />
              </div>
            )}
            <div>
              <Label htmlFor="auth-email">邮箱</Label>
              <Input
                id="auth-email"
                className="mt-2"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
              />
            </div>
            <div>
              <Label htmlFor="auth-password">密码</Label>
              <Input
                id="auth-password"
                className="mt-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isRegister) {
                    submit();
                  }
                }}
              />
            </div>
            {isRegister && (
              <div>
                <Label htmlFor="auth-confirm">确认密码</Label>
                <Input
                  id="auth-confirm"
                  className="mt-2"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      submit();
                    }
                  }}
                />
              </div>
            )}
          </div>

          {loginError && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {loginError}
            </div>
          )}

          <Button className="mt-6 w-full" onClick={submit}>
            <LockKeyhole className="h-4 w-4" />
            {isRegister ? "创建账号并进入" : "登录工作台"}
          </Button>

          {!isRegister && (
            <p className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
              演示账号：demo@guangying.ai / 123456。你也可以切换到「注册」创建自己的本地账号。
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
