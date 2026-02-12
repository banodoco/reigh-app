-- Add foreign key from tasks.task_type to task_types.name
-- Enables PostgREST join syntax in complete_task edge function,
-- merging two sequential queries into one.

ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_type_fkey
  FOREIGN KEY (task_type) REFERENCES task_types(name);
