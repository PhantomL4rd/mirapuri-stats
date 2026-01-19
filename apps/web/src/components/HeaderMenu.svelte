<script lang="ts">
  import { Menu, SwatchBook, X } from 'lucide-svelte';

  let isOpen = $state(false);

  function toggle() {
    isOpen = !isOpen;
  }

  function close() {
    isOpen = false;
  }
</script>

<button
  onclick={toggle}
  class="p-2 rounded-md hover:bg-primary-foreground/10 transition-colors"
  aria-label="メニューを開く"
  aria-expanded={isOpen}
>
  <Menu class="size-6" />
</button>

{#if isOpen}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 z-40 bg-black/50 transition-opacity"
    onclick={close}
    aria-label="メニューを閉じる"
  ></button>

  <!-- Drawer -->
  <div class="fixed top-0 right-0 z-50 h-full w-64 bg-card text-card-foreground shadow-xl transform transition-transform">
    <div class="flex items-center justify-between p-4 border-b">
      <span class="font-bold">メニュー</span>
      <button
        onclick={close}
        class="p-2 rounded-md hover:bg-accent transition-colors"
        aria-label="メニューを閉じる"
      >
        <X class="size-5" />
      </button>
    </div>

    <nav class="p-2">
      <p class="px-3 py-2 text-xs text-muted-foreground">外部リンク</p>
      <a
        href="https://colorant-picker.pl4rd.com"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
        onclick={close}
      >
        <SwatchBook class="size-5" />
        カララントピッカー
      </a>
      <a href="https://jp.finalfantasyxiv.com/lodestone/character/27344914/blog/5649674/"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
        onclick={close}>ご意見・ご要望</a>
    </nav>
  </div>
{/if}
