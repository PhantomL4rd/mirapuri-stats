<script lang="ts">
  import { cn } from '../lib/utils';
  import { Search } from 'lucide-svelte';

  interface SearchResult {
    itemId: string;
    itemName: string;
    slotId: number;
  }

  const SLOT_NAMES: Record<number, string> = {
    1: '頭',
    2: '胴',
    3: '手',
    4: '脚',
    5: '足',
  };

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let isOpen = $state(false);
  let isLoading = $state(false);
  let selectedIndex = $state(-1);
  let inputElement: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  async function search(q: string) {
    if (q.length < 1) {
      results = [];
      return;
    }

    isLoading = true;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        results = await res.json();
      }
    } catch (e) {
      console.error('Search error:', e);
      results = [];
    } finally {
      isLoading = false;
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    query = target.value;
    selectedIndex = -1;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      search(query);
    }, 200);
  }

  function handleFocus() {
    isOpen = true;
    if (query.length >= 1) {
      search(query);
    }
  }

  function handleBlur(e: FocusEvent) {
    // ドロップダウン内をクリックした場合は閉じない
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget?.closest('.search-dropdown')) {
      return;
    }
    setTimeout(() => {
      isOpen = false;
    }, 150);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          selectItem(results[selectedIndex]);
        }
        break;
      case 'Escape':
        isOpen = false;
        inputElement?.blur();
        break;
    }
  }

  function selectItem(item: SearchResult) {
    window.location.href = `/item/${item.itemId}`;
  }
</script>

<div class="relative mb-8">
  <div class="relative">
    <Search class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
    <input
      bind:this={inputElement}
      type="text"
      placeholder="アイテム名で検索..."
      value={query}
      oninput={handleInput}
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      class="w-full pl-12 pr-4 py-3 text-lg rounded-xl border-2 border-primary/30 bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-sm transition-all"
    />
  </div>

  {#if isOpen && (results.length > 0 || isLoading || query.length >= 1)}
    <div
      class="search-dropdown absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden"
    >
      {#if isLoading}
        <div class="p-3 text-center text-sm text-muted-foreground">検索中...</div>
      {:else if results.length === 0 && query.length >= 1}
        <div class="p-3 text-center text-sm text-muted-foreground">見つかりませんでした</div>
      {:else}
        <ul class="max-h-64 overflow-y-auto">
          {#each results as item, index}
            <li>
              <button
                type="button"
                class={cn(
                  'w-full px-3 py-2 text-left flex items-center justify-between hover:bg-muted/50 transition-colors',
                  index === selectedIndex && 'bg-muted',
                )}
                onmousedown={() => selectItem(item)}
                onmouseenter={() => (selectedIndex = index)}
              >
                <span class="text-card-foreground">{item.itemName}</span>
                <span class="text-xs text-muted-foreground">{SLOT_NAMES[item.slotId]}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
