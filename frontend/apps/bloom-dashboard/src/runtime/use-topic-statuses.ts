import type { RosTopicStatus } from "@bloom/api-client";
import { useEffect, useState } from "react";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

const REFRESH_MS = 2000;

/** The graph's topic list every two seconds: undefined without a client to ask, null while unanswered. */
export function useTopicStatuses(
  listRosTopicStatus: RuntimeActionClient["listRosTopicStatus"],
): readonly RosTopicStatus[] | null | undefined {
  const [topicStatuses, setTopicStatuses] = useState<readonly RosTopicStatus[] | null | undefined>(() =>
    listRosTopicStatus ? null : undefined,
  );

  useEffect(() => {
    if (!listRosTopicStatus) {
      setTopicStatuses(undefined);
      return;
    }

    let cancelled = false;
    setTopicStatuses(null);
    const refresh = () => {
      listRosTopicStatus()
        .then((nextStatuses) => {
          if (!cancelled) {
            setTopicStatuses(nextStatuses);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTopicStatuses(null);
          }
        });
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [listRosTopicStatus]);

  return topicStatuses;
}
