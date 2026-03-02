/**
 * IPC helpers — invoke Tauri commands to communicate with the Python sidecar.
 */
import { invoke } from "@tauri-apps/api/core";

export async function initEngine(): Promise<{
  status: string;
  gpu: boolean;
  provider: string;
}> {
  return invoke("init_engine");
}

export async function shutdownEngine(): Promise<void> {
  return invoke("shutdown_engine");
}

export async function addReference(
  path: string,
  slotId?: string
): Promise<{
  status: string;
  reference_id?: string;
  face_count: number;
  has_multiple_faces?: boolean;
  bbox?: number[];
}> {
  return invoke("add_reference", { path, slotId });
}

export async function removeReference(referenceId: string): Promise<void> {
  return invoke("remove_reference", { referenceId });
}

export async function clearAllReferences(): Promise<void> {
  return invoke("clear_references");
}

export async function startSorting(config: Record<string, unknown>): Promise<{
  status: string;
  stats: Record<string, number>;
}> {
  return invoke("start_sorting", { config });
}

export async function pauseSorting(): Promise<void> {
  return invoke("pause_sorting");
}

export async function resumeSorting(): Promise<void> {
  return invoke("resume_sorting");
}

export async function stopSorting(): Promise<void> {
  return invoke("stop_sorting");
}

export async function getSystemInfo(): Promise<{
  gpu_available: boolean;
  gpu_name: string;
  provider: string;
  cpu_count: number;
}> {
  return invoke("get_system_info");
}
