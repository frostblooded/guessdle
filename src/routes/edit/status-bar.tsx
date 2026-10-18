// The editor's status row: the status notice and the moves open to this user (Submit, Unpublish,
// and an admin's Approve and Reject on a pending game).
import { useState } from "react";
import { ReviewButtons } from "../../components/review-buttons.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { statusNotice, type Details } from "../../game/editor.ts";
import { minEntriesOf } from "../../game/blur.ts";
import { api, errorText } from "../../manage-client.ts";

export function StatusBar({
  base,
  details,
  name,
  onDetails,
  onReviewed,
}: {
  base: string;
  details: Details;
  name: string;
  onDetails: (details: Details) => void;
  onReviewed: () => Promise<void>;
}) {
  const [flowError, setFlowError] = useState("");

  // Submit and unpublish move the status; the server answers with the fresh details
  const flow = async (action: "submit" | "unpublish"): Promise<void> => {
    const out = await api<Details>("POST", `${base}/${action}`, {});
    if (out?.status === 200) {
      onDetails(out.data);
    }
    setFlowError(out?.status === 200 ? "" : errorText(out));
  };

  const notice = statusNotice(details);
  // A rejected game resubmits by editing, but a plain Submit is allowed too
  const canSubmit = details.status === "draft" || details.status === "rejected";

  return (
    <div className="editor-bar flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1 space-y-2 empty:hidden">
        {notice && (
          <Alert
            id="status-notice"
            variant={details.status === "rejected" ? "error" : "warn"}
            role="status"
            data-status={details.status}
          >
            {notice}
          </Alert>
        )}
        {flowError && (
          <Alert id="flow-error" variant="error" role="alert">
            {flowError}
          </Alert>
        )}
      </div>
      <div className="editor-actions flex flex-wrap gap-2">
        {canSubmit && (
          <Button
            id="submit-button"
            disabled={
              details.entryCount < minEntriesOf(details.kind) ||
              details.incompleteCount > 0
            }
            onClick={() => void flow("submit")}
          >
            Submit for approval
          </Button>
        )}
        {details.canApprove && (
          <ReviewButtons
            slug={details.slug}
            name={name}
            size="default"
            approveId="approve-button"
            rejectId="reject-button"
            onDone={async () => {
              setFlowError("");
              await onReviewed();
            }}
            onFail={setFlowError}
          />
        )}
        {details.status === "approved" && (
          <Button
            id="unpublish-button"
            variant="secondary"
            onClick={() => void flow("unpublish")}
          >
            Unpublish
          </Button>
        )}
      </div>
    </div>
  );
}
