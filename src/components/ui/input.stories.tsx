import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input, Label, NativeSelect, Textarea } from "./input.tsx";

const meta = {
  component: Input,
  args: { placeholder: "Guess a name..." },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };

// The fields of the editor's details form, labelled as on the page
export const Form: Story = {
  render: () => (
    <div className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="story-name">Name</Label>
        <Input id="story-name" defaultValue="Catdle" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="story-description">Description</Label>
        <Textarea
          id="story-description"
          rows={3}
          defaultValue="Guess the cat of the day from its colors and owners."
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="story-type">Type</Label>
        <NativeSelect id="story-type" defaultValue="text">
          <option value="text">Text</option>
          <option value="list">List</option>
        </NativeSelect>
      </div>
    </div>
  ),
};
