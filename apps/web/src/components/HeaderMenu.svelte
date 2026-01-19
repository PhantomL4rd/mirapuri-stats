<script lang="ts">
  import { Menu, MessageCircle, SwatchBook, X, Search, Info } from 'lucide-svelte';
  import { cn } from '../lib/utils';

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

  let isMenuOpen = $state(false);
  let isSearchOpen = $state(false);

  // 検索関連
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let isLoading = $state(false);
  let selectedIndex = $state(-1);
  let inputElement: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function closeMenu() {
    isMenuOpen = false;
  }

  function openSearch() {
    isSearchOpen = true;
    // 次のフレームでinputにフォーカス
    setTimeout(() => inputElement?.focus(), 50);
  }

  function closeSearch() {
    isSearchOpen = false;
    query = '';
    results = [];
    selectedIndex = -1;
  }

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

  function handleKeydown(e: KeyboardEvent) {
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
        closeSearch();
        break;
    }
  }

  function selectItem(item: SearchResult) {
    window.location.href = `/item/${item.itemId}`;
  }
</script>

<!-- Search Button -->
<button
  onclick={openSearch}
  class="p-2 rounded-md hover:bg-primary-foreground/10 transition-colors"
  aria-label="検索を開く"
>
  <Search class="size-6" />
</button>

<!-- Menu Button -->
<button
  onclick={toggleMenu}
  class="p-2 rounded-md hover:bg-primary-foreground/10 transition-colors"
  aria-label="メニューを開く"
  aria-expanded={isMenuOpen}
>
  <Menu class="size-6" />
</button>

{#if isSearchOpen}
  <!-- Search Modal Backdrop -->
  <button
    class="fixed inset-0 z-40 bg-black/50 transition-opacity"
    onclick={closeSearch}
    aria-label="検索を閉じる"
  ></button>

  <!-- Search Modal -->
  <div class="fixed top-0 left-0 right-0 z-50 bg-card shadow-xl p-4">
    <div class="mx-auto max-w-2xl">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <input
            bind:this={inputElement}
            type="text"
            placeholder="アイテム名で検索..."
            value={query}
            oninput={handleInput}
            onkeydown={handleKeydown}
            class="w-full pl-10 pr-4 py-3 text-lg rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          onclick={closeSearch}
          class="p-2 rounded-md hover:bg-accent transition-colors"
          aria-label="検索を閉じる"
        >
          <X class="size-6" />
        </button>
      </div>

      {#if results.length > 0 || isLoading || query.length >= 1}
        <div class="mt-2 rounded-lg border border-border bg-card overflow-hidden">
          {#if isLoading}
            <div class="p-3 text-center text-sm text-muted-foreground">検索中...</div>
          {:else if results.length === 0 && query.length >= 1}
            <div class="p-3 text-center text-sm text-muted-foreground">見つかりませんでした</div>
          {:else}
            <ul class="max-h-80 overflow-y-auto">
              {#each results as item, index}
                <li>
                  <button
                    type="button"
                    class={cn(
                      'w-full px-4 py-3 text-left flex items-center justify-between hover:bg-muted/50 transition-colors',
                      index === selectedIndex && 'bg-muted',
                    )}
                    onclick={() => selectItem(item)}
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
  </div>
{/if}

{#if isMenuOpen}
  <!-- Menu Backdrop -->
  <button
    class="fixed inset-0 z-40 bg-black/50 transition-opacity"
    onclick={closeMenu}
    aria-label="メニューを閉じる"
  ></button>

  <!-- Menu Drawer -->
  <div class="fixed top-0 right-0 z-50 h-full w-64 bg-card text-card-foreground shadow-xl transform transition-transform">
    <div class="flex items-center justify-between p-4 border-b">
      <span class="font-bold">メニュー</span>
      <button
        onclick={closeMenu}
        class="p-2 rounded-md hover:bg-accent transition-colors"
        aria-label="メニューを閉じる"
      >
        <X class="size-5" />
      </button>
    </div>

    <nav class="p-2">
      <a
        href="/readme"
        class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
        onclick={closeMenu}
      >
        <Info class="size-5" />
        このサイトについて
      </a>
      <p class="px-3 py-2 text-xs text-muted-foreground">外部リンク</p>
      <a
        href="https://colorant-picker.pl4rd.com"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
        onclick={closeMenu}
      >
        <SwatchBook class="size-5" />
        カララントピッカー
      </a>
      <a href="https://jp.finalfantasyxiv.com/lodestone/character/27344914/blog/5649674/"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
        onclick={closeMenu}
      >
        <MessageCircle class="size-5" />
        ご意見・ご要望
      </a>
    </nav>
  </div>
{/if}
