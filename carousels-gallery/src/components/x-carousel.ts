interface CarouselCommandEvent extends Event {
  command: string;
}

const pageScrollRatio = 0.85;

class XCarousel extends HTMLElement {
  #scroller: HTMLElement | null = null;
  #slides: HTMLElement[] = [];
  #markers: HTMLAnchorElement[] = [];
  #markerGroup: HTMLElement | null = null;
  #pageOutput: HTMLElement | null = null;
  #activeSlide: HTMLElement | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #visibilityObserver: IntersectionObserver | null = null;
  #initialSlide: HTMLElement | null = null;
  #animationFrame = 0;

  connectedCallback() {
    this.#scroller = this.querySelector<HTMLElement>("[data-carousel-scroller]");

    if (!this.#scroller) {
      console.warn("<x-carousel> needs a [data-carousel-scroller] element.", this);
      return;
    }

    this.#slides = Array.from(
      this.#scroller.querySelectorAll<HTMLElement>(
        ":scope > [data-carousel-slide]",
      ),
    );
    this.#markerGroup = this.querySelector<HTMLElement>(
      "[data-carousel-marker-group]",
    );
    this.#pageOutput = this.querySelector<HTMLElement>("[data-carousel-page]");
    this.#markers = this.#markerGroup
      ? Array.from(
          this.#markerGroup.querySelectorAll<HTMLAnchorElement>(
            "a[href^='#']",
          ),
        )
      : [];

    this.addEventListener("command", this.#onCommand);
    this.#scroller.addEventListener("scroll", this.#scheduleSync, {
      passive: true,
    });
    this.#markerGroup?.addEventListener("click", this.#onMarkerClick);

    this.#resizeObserver = new ResizeObserver(this.#scheduleSync);
    this.#resizeObserver.observe(this.#scroller);
    this.#slides.forEach((slide) => this.#resizeObserver?.observe(slide));

    this.#visibilityObserver = new IntersectionObserver(
      this.#onVisibilityChange,
      {
        root: this.#scroller,
        threshold: 0.01,
      },
    );
    this.#slides.forEach((slide) => this.#visibilityObserver?.observe(slide));

    this.toggleAttribute("data-enhanced", true);

    this.#initialSlide = this.#slides.find((slide) =>
      slide.hasAttribute("data-carousel-initial"),
    ) ?? null;

    if (this.#initialSlide) {
      if (document.readyState === "complete") {
        this.#scrollToInitialSlide();
      } else {
        window.addEventListener("load", this.#scrollToInitialSlide, {
          once: true,
        });
      }
    } else {
      this.#scheduleSync();
    }
  }

  disconnectedCallback() {
    this.removeEventListener("command", this.#onCommand);
    this.#scroller?.removeEventListener("scroll", this.#scheduleSync);
    this.#markerGroup?.removeEventListener("click", this.#onMarkerClick);
    window.removeEventListener("load", this.#scrollToInitialSlide);
    this.#resizeObserver?.disconnect();
    this.#visibilityObserver?.disconnect();
    cancelAnimationFrame(this.#animationFrame);

    this.#resizeObserver = null;
    this.#visibilityObserver = null;
    this.#scroller = null;
    this.#markerGroup = null;
    this.#pageOutput = null;
    this.#activeSlide = null;
    this.#initialSlide = null;
    this.#slides = [];
    this.#markers = [];
  }

  #onCommand = (event: Event) => {
    const { command } = event as CarouselCommandEvent;

    if (command !== "--prev" && command !== "--next") return;

    event.preventDefault();
    this.#scrollByPage(command === "--prev" ? -1 : 1);
  };

  #onMarkerClick = (event: Event) => {
    if (!(event.target instanceof Element)) return;

    const marker = event.target.closest<HTMLAnchorElement>("a[href^='#']");
    if (!marker || !this.#markers.includes(marker)) return;

    const targetId = decodeURIComponent(marker.hash.slice(1));
    const target = this.#slides.find((slide) => slide.id === targetId);
    if (!target) return;

    event.preventDefault();
    this.#centerMarker(marker);
    this.#scrollToSlide(target);
  };

  #scrollToInitialSlide = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.isConnected || !this.#initialSlide) return;

        this.#scrollToSlide(this.#initialSlide, "instant");
        this.#scheduleSync();
      });
    });
  };

  #scrollToSlide(slide: HTMLElement, behavior = this.#scrollBehavior) {
    if (!this.#scroller) return;

    const left = this.#getInlineSnapOffset(slide);

    if (behavior === "instant") {
      const scrollBehavior = this.#scroller.style.scrollBehavior;
      this.#scroller.style.scrollBehavior = "auto";
      this.#scroller.scrollLeft += left;
      this.#scroller.style.scrollBehavior = scrollBehavior;
      return;
    }

    this.#scroller.scrollBy({
      behavior,
      left,
    });
  }

  #getInlineSnapOffset(slide: HTMLElement) {
    if (!this.#scroller) return 0;

    const scrollerBounds = this.#scroller.getBoundingClientRect();
    const scrollerStyles = getComputedStyle(this.#scroller);
    const slideBounds = slide.getBoundingClientRect();
    const slideStyles = getComputedStyle(slide);
    const isRtl = scrollerStyles.direction === "rtl";
    const scrollPaddingStart =
      Number.parseFloat(scrollerStyles.scrollPaddingInlineStart) || 0;
    const scrollPaddingEnd =
      Number.parseFloat(scrollerStyles.scrollPaddingInlineEnd) || 0;
    const snapAlignValues = slideStyles.scrollSnapAlign.trim().split(/\s+/);
    const snapAlign =
      snapAlignValues.length > 1 ? snapAlignValues[1] : snapAlignValues[0];

    const scrollerStart = isRtl
      ? scrollerBounds.right - scrollPaddingStart
      : scrollerBounds.left + scrollPaddingStart;
    const scrollerEnd = isRtl
      ? scrollerBounds.left + scrollPaddingEnd
      : scrollerBounds.right - scrollPaddingEnd;
    const slideStart = isRtl ? slideBounds.right : slideBounds.left;
    const slideEnd = isRtl ? slideBounds.left : slideBounds.right;

    if (snapAlign === "center") {
      return (
        (slideBounds.left + slideBounds.right) / 2 -
        (scrollerStart + scrollerEnd) / 2
      );
    }

    if (snapAlign === "end") return slideEnd - scrollerEnd;

    return slideStart - scrollerStart;
  }

  #onVisibilityChange = (entries: IntersectionObserverEntry[]) => {
    if (!this.#scroller) return;

    for (const entry of entries) {
      if (!(entry.target instanceof HTMLElement)) continue;

      const isVisible = entry.isIntersecting;
      if (isVisible) {
        entry.target.setAttribute("data-scroll-visible", "inline");
      } else {
        entry.target.removeAttribute("data-scroll-visible");
      }

      this.#syncSlideInert(entry.target);
    }
  };

  #syncSlideInert(slide: HTMLElement) {
    if (!this.#scroller) return;

    const inertOffscreen =
      this.#scroller.hasAttribute("data-inert-offscreen") &&
      !slide.hasAttribute("data-scroll-visible");
    const inertUnsnapped =
      this.#scroller.hasAttribute("data-inert-unsnapped") &&
      !slide.hasAttribute("data-scroll-snapped");

    if (this.#scroller.matches("[data-inert-offscreen], [data-inert-unsnapped]")) {
      slide.toggleAttribute("inert", inertOffscreen || inertUnsnapped);
    }
  }

  #scheduleSync = () => {
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = requestAnimationFrame(() => this.#syncState());
  };

  #syncState() {
    if (!this.#scroller || this.#slides.length === 0) return;

    let closestSlide = this.#slides[0];
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const slide of this.#slides) {
      const distance = Math.abs(this.#getInlineSnapOffset(slide));

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSlide = slide;
      }
    }

    this.#setActiveSlide(closestSlide);
    this.#syncScrollability(closestSlide);
  }

  #syncScrollability(activeSlide: HTMLElement) {
    if (!this.#scroller) return;

    const activeIndex = this.#slides.indexOf(activeSlide);
    const canScrollPrev = activeIndex > 0;
    const canScrollNext = activeIndex < this.#slides.length - 1;
    const scrollableDirections = [
      canScrollPrev ? "inline-start" : "",
      canScrollNext ? "inline-end" : "",
    ]
      .filter(Boolean)
      .join(" ");

    this.setAttribute("data-scrollable", scrollableDirections);
    this.#scroller.setAttribute("data-scrollable", scrollableDirections);

    for (const button of this.querySelectorAll<HTMLButtonElement>(
      "button[command][commandfor]",
    )) {
      if (button.getAttribute("commandfor") !== this.id) continue;

      if (button.getAttribute("command") === "--prev") {
        button.disabled = !canScrollPrev;
      } else if (button.getAttribute("command") === "--next") {
        button.disabled = !canScrollNext;
      }
    }
  }

  #setActiveSlide(slide: HTMLElement) {
    for (const candidate of this.#slides) {
      if (candidate === slide) {
        candidate.setAttribute("data-scroll-snapped", "inline");
      } else {
        candidate.removeAttribute("data-scroll-snapped");
      }

      this.#syncSlideInert(candidate);
    }

    this.dataset.activeSlide = slide.id;

    if (this.#pageOutput) {
      this.#pageOutput.textContent = `${this.#slides.indexOf(slide) + 1} / ${this.#slides.length}`;
    }

    const activeMarker = this.#markers.find(
      (marker) => decodeURIComponent(marker.hash.slice(1)) === slide.id,
    );

    for (const marker of this.#markers) {
      if (marker === activeMarker) {
        marker.setAttribute("aria-current", "true");
      } else {
        marker.removeAttribute("aria-current");
      }
    }

    if (this.#activeSlide === slide) return;

    this.#activeSlide = slide;
    if (activeMarker) this.#centerMarker(activeMarker);
  }

  #centerMarker(marker: HTMLAnchorElement) {
    if (!this.#markerGroup) return;

    const markerGroupBounds = this.#markerGroup.getBoundingClientRect();
    const markerBounds = marker.getBoundingClientRect();
    const left =
      this.#markerGroup.scrollLeft +
      markerBounds.left -
      markerGroupBounds.left -
      (this.#markerGroup.clientWidth - markerBounds.width) / 2;

    this.#markerGroup.scrollTo({
      behavior: this.#scrollBehavior,
      left,
    });
  }

  #scrollByPage(direction: -1 | 1) {
    if (!this.#scroller) return;

    const isRtl = getComputedStyle(this.#scroller).direction === "rtl";
    this.#scroller.scrollBy({
      behavior: this.#scrollBehavior,
      left:
        direction * this.#scroller.clientWidth * pageScrollRatio *
        (isRtl ? -1 : 1),
    });
  }

  get #scrollBehavior(): ScrollBehavior {
    return matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }
}

if (!customElements.get("x-carousel")) {
  customElements.define("x-carousel", XCarousel);
}
