import { mergeAttributes, Node } from "@tiptap/core";

type IframeAttrs = {
  src: string;
  width?: string;
  height?: string;
  title?: string;
  allow?: string;
  loading?: string;
  referrerpolicy?: string;
  sandbox?: string;
  frameborder?: string;
  allowfullscreen?: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    iframeEmbed: {
      insertIframe: (attrs: IframeAttrs) => ReturnType;
    };
  }
}

export const IframeEmbed = Node.create({
  name: "iframeEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      width: { default: "100%" },
      height: { default: "420" },
      title: { default: "Embedded content" },
      allow: { default: null },
      loading: { default: "lazy" },
      referrerpolicy: { default: null },
      sandbox: { default: null },
      frameborder: { default: "0" },
      allowfullscreen: { default: "true" },
    };
  },

  parseHTML() {
    return [{ tag: "iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["iframe", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertIframe:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },
});
