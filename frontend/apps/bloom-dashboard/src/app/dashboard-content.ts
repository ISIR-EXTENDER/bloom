export type DashboardStep = {
  id: string;
  title: string;
  description: string;
};

export const dashboardSteps: DashboardStep[] = [
  {
    id: "configure",
    title: "Configure",
    description: "Build interface layouts from validated application configurations.",
  },
  {
    id: "control",
    title: "Control",
    description: "Expose device commands through reusable widgets and clean API boundaries.",
  },
  {
    id: "observe",
    title: "Observe",
    description: "Keep robot state, camera streams, and operator feedback visible in one place.",
  },
];

export const dashboardPrinciples = [
  "Generic web logic stays independent from ROS.",
  "Robot-specific behavior enters through explicit adapters.",
  "Every migrated slice ships with tests before it becomes the default path.",
];
