<script lang="ts">
  import { Menu, MessageCircle, SwatchBook, X, Info, Eye } from 'lucide-svelte';
  import SearchModal from './SearchModal.svelte';
  import VersionPicker from './VersionPicker.svelte';

  interface VersionInfo {
    version: string;
    dataFrom: string | null;
    dataTo: string | null;
    syncedAt: string;
    isActive: boolean;
  }

  interface Props {
    versions?: VersionInfo[];
    currentVersion?: string;
  }

  let { versions = [], currentVersion = '' }: Props = $props();

  let isMenuOpen = $state(false);

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function closeMenu() {
    isMenuOpen = false;
  }

  const hasMultipleVersions = $derived(versions.length > 1);
</script>

<SearchModal {currentVersion} />

{#if hasMultipleVersions}
  <VersionPicker {versions} {currentVersion} />
{/if}

<button
  onclick={toggleMenu}
  class="p-2 rounded-md hover:bg-primary-foreground/10 transition-colors"
  aria-label="メニューを開く"
  aria-expanded={isMenuOpen}
>
  <Menu class="size-6" />
</button>

{#if isMenuOpen}
  <button
    class="fixed inset-0 z-40 bg-black/50 transition-opacity"
    onclick={closeMenu}
    aria-label="メニューを閉じる"
  ></button>

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
        href="/hidden-gems"
        class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
        onclick={closeMenu}
      >
        <Eye class="size-5" />
        名脇役ランキング
      </a>
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
