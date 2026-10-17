import { AstridRuntimeClient } from "@/integrations/runtime/client.ts";

/** Both editor transports must negotiate the same existing Runtime authority. */
export async function assertNativeEditorConnection(): Promise<void> {
  const persistence = new AstridRuntimeClient();
  const discovery = new AstridRuntimeClient({ baseUrl: "/api/astrid" });
  const [runtime, workspace] = await Promise.all([
    persistence.ensureSession(),
    discovery.ensureSession(),
  ]);
  const runtimeInstance = (runtime.health as { runtime_instance_id?: string })
    .runtime_instance_id;
  const workspaceInstance = (
    workspace.health as { runtime_instance_id?: string }
  ).runtime_instance_id;
  if (
    !runtimeInstance ||
    !workspaceInstance ||
    runtime.realm.realm_id !== workspace.realm.realm_id ||
    runtimeInstance !== workspaceInstance
  ) {
    throw new Error(
      "Workspace discovery and persistence belong to different Runtime instances.",
    );
  }
  await discovery.listProjects();
}
