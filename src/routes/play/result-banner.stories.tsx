import type { Meta, StoryObj } from "@storybook/react-vite";
import ati from "../../../howto/ati.jpg";
import { ResultBanner } from "./result-banner.tsx";

const meta = {
  component: ResultBanner,
  args: {
    result: { kind: "victory", answer: "Ati" },
    roster: [{ id: 1, name: "Ati", photo: ati }],
  },
} satisfies Meta<typeof ResultBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Victory: Story = {};
export const GaveUp: Story = {
  args: { result: { kind: "give-up", answer: "Ati" } },
};
export const NoPhoto: Story = {
  args: { roster: [{ id: 1, name: "Ati", photo: "" }] },
};
export const OutOfTries: Story = {
  args: {
    result: { kind: "lost", answer: "Ati", photo: ati },
    roster: [{ id: 1, name: "Ati", photo: "" }],
  },
};
export const WithDescription: Story = {
  args: {
    result: {
      kind: "victory",
      answer: "Ati",
      description: "A grey tabby who sleeps on the radiator all winter.",
    },
  },
};
