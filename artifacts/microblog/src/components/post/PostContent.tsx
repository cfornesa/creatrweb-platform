import type { PostContentFormat } from "@workspace/api-client-react";

type PostContentProps = {
  content: string;
  contentFormat: PostContentFormat;
  className?: string;
};

export function PostContent({ content, contentFormat, className }: PostContentProps) {
  if (contentFormat === "plain") {
    return (
      <p className={className ?? "text-base text-foreground whitespace-pre-wrap break-words leading-relaxed"}>
        {content}
      </p>
    );
  }

  return (
    <div
      className={
        className ??
        "prose prose-neutral max-w-none break-words text-foreground prose-p:my-3 prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-5 prose-h3:mb-2 prose-img:rounded-xl prose-img:border prose-img:border-border prose-iframe:w-full prose-iframe:rounded-xl prose-iframe:border prose-iframe:border-border"
      }
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
