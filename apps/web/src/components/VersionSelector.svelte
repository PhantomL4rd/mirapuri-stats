<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  interface VersionInfo {
    version: string;
    dataFrom: string | null;
    dataTo: string | null;
    syncedAt: string;
    isActive: boolean;
  }

  interface Props {
    versions: VersionInfo[];
    currentVersion: string;
  }

  let { versions, currentVersion }: Props = $props();

  function formatDateSlash(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${m}/${d}`;
  }

  function getLabel(v: VersionInfo): string {
    const period = v.dataFrom && v.dataTo
      ? `${formatDateSlash(v.dataFrom)} - ${formatDateSlash(v.dataTo)}`
      : '期間不明';
    return v.isActive ? `${period} (最新)` : period;
  }

  function handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const selectedVersion = select.value;

    const url = new URL(window.location.href);

    // 最新バージョンの場合は version パラメータを削除
    const activeVersion = versions.find(v => v.isActive)?.version;
    if (selectedVersion === activeVersion) {
      url.searchParams.delete('version');
    } else {
      url.searchParams.set('version', selectedVersion);
    }

    window.location.href = url.toString();
  }

  const isViewingOldData = $derived(!versions.find(v => v.version === currentVersion)?.isActive);
</script>

{#if versions.length > 1}
  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    <span>統計期間:</span>
    <div class="relative inline-block">
      <select
        value={currentVersion}
        onchange={handleChange}
        class="appearance-none bg-transparent border border-border rounded px-2 py-0.5 pr-6 text-xs cursor-pointer hover:border-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {#each versions as v}
          <option value={v.version}>{getLabel(v)}</option>
        {/each}
      </select>
      <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 pointer-events-none" />
    </div>
    {#if isViewingOldData}
      <span class="text-amber-600">(過去データ)</span>
    {/if}
  </div>
{:else if versions.length === 1}
  {@const v = versions[0]}
  {#if v.dataFrom && v.dataTo}
    <div class="text-xs text-muted-foreground">
      統計期間: {formatDateSlash(v.dataFrom)} - {formatDateSlash(v.dataTo)}
    </div>
  {/if}
{/if}
