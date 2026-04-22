export default function PreviewStaffPlaceholder({ title, description }) {
  return (
    <div className="preview-staff-page">
      <section className="preview-staff-page__hero">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <section className="preview-staff-placeholder">
        <h2>Static preview not added yet</h2>
        <p>This staff page will be added later. The navigation is already wired so you can preview the employee header.</p>
      </section>
    </div>
  );
}
