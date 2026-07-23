import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, style, onInput, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback(
      (element: HTMLTextAreaElement | null) => {
        innerRef.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = element;
      },
      [ref]
    );

    React.useLayoutEffect(() => {
      const textarea = innerRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, [value]);

    function handleInput(event: React.FormEvent<HTMLTextAreaElement>) {
      const textarea = event.currentTarget;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      onInput?.(event as never);
    }

    return (
      <textarea
        className={cn(
          "flex min-h-[8rem] w-full rounded-md border border-border bg-card px-3.5 py-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={setRefs}
        style={{ overflow: "hidden", minHeight: 128, ...style }}
        onInput={handleInput}
        value={value}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
