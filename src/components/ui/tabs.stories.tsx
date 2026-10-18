import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.tsx";

const meta = { component: Tabs } satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const TABS = ["details", "attributes", "entries", "answers"];

// The editor's tabs: every panel stays mounted, the unselected ones hidden
function EditorTabs() {
  const [tab, setTab] = useState("details");
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        {TABS.map((name) => (
          <TabsTrigger key={name} value={name} panelId={`story-${name}`}>
            {name[0]!.toUpperCase() + name.slice(1)}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((name) => (
        <TabsContent
          key={name}
          id={`story-${name}`}
          value={name}
          selected={tab}
          className="pt-4"
        >
          The {name} panel.
        </TabsContent>
      ))}
    </Tabs>
  );
}

export const Default: Story = { render: () => <EditorTabs /> };
