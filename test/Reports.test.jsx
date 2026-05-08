import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Reports from "../src/pages/member/Reports";
import { AuthProvider, useAuth } from "../src/provider/AuthContext";
import * as reportService from "../src/services/reportService";
import { testViewFacility, clearCollection, testLoginMember, testLogout, testViewReports } from "./TestCommonFunc"

vi.mock("../src/provider/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Render helper
const renderComponent = () =>
  render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
  );

describe("Reports Component Unit Test", () => {

    beforeEach(async () => {
        await testViewFacility();
        await testLoginMember();
        await testViewReports();
    });

    afterEach(async () => {
        await clearCollection("facility");
        await clearCollection("time_slot");
        await clearCollection("repair");
        await testLogout();
    });


  it("Case_Reports_1: Click the list of 'Facility Name' - Display a list of available facilities", async () => {
    renderComponent();

    // 等待下拉菜单的 option 中出现了来自 Mock 的数据
    expect(await screen.findByRole("option", { name: "Test Venue" })).toBeInTheDocument();

    // Find the Facility Name combobox
    const facilitySelect = screen.getByLabelText(/Facility Name/i);
    
    // Verify options are correctly loaded into the select element
    const options = Array.from(facilitySelect.options).map(opt => opt.text);

    expect(options).toContain("Select a facility...");
    expect(options).toContain("Test Venue");
    expect(options).toContain("Fixing Venue");
  });

  it("Case_Reports_2: Click the list of 'Faulty Part' - Display a list of faulty Parts", async () => {
    renderComponent();

    // Find the Faulty Part combobox
    const partSelect = await screen.findByLabelText(/Faulty Part/i);
    
    // Verify the static options are displayed
    const options = Array.from(partSelect.options).map(opt => opt.text);
    expect(options).toContain("Select the faulty part...");
    expect(options).toContain("Light");
    expect(options).toContain("Equipment");
    expect(options).toContain("Surface");
    expect(options).toContain("Electricity");
    expect(options).toContain("Other");
  });

  it("Case_Reports_3: Type in the blank of description - The counting num changed correspondingly", async () => {
    renderComponent();

    // Wait for render
    const descriptionInput = await screen.findByLabelText(/Issue Description/i);

    // Type a short description (10 characters)
    fireEvent.change(descriptionInput, { target: { value: "Broken net" } });

    // Verify the counter correctly updates
    expect(await screen.findByText("9/500")).toBeInTheDocument();
  });

  it("Case_Reports_4: Type in the blank of over 500 - The text limited to 500 and failed to type in more", async () => {
    renderComponent();

    const descriptionInput = await screen.findByLabelText(/Issue Description/i);
    
    // Generate a string with 501 characters
    const overLimitText = "A".repeat(501);
    
    // Attempt to type it in
    fireEvent.change(descriptionInput, { target: { value: overLimitText } });

    // Verify the system rejects it and outputs an error instead of accepting the text
    expect(await screen.findByText("Issue description must stay within 500 characters.")).toBeInTheDocument();
    
    // Verify that the text input ignores the value and counting stops (state remains un-updated or old value)
    expect(screen.getByText("0/500")).toBeInTheDocument();
    expect(descriptionInput.value).toBe(""); 
  });

  it("Case_Reports_5: Let the 'Facility Name' empty, click 'Submit Ticket' - Display Error info", async () => {
    renderComponent();

    // Wait for the data to populate
    expect(await screen.findByRole("option", { name: "Test Venue" })).toBeInTheDocument();

    // Fill in Faulty Part and Description, but leave Facility Name empty
    fireEvent.change(screen.getByLabelText(/Faulty Part/i), { target: { value: "equipment" } });
    fireEvent.change(screen.getByLabelText(/Issue Description/i), { target: { value: "The net is torn." } });

    // Click submit
    const submitBtn = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    // Expect the required facility error to pop up
    expect(await screen.findByText("Please select a facility before submitting.")).toBeInTheDocument();
  });

  it("Case_Reports_6: Let the 'Faulty Part' empty, click 'Submit Ticket' - Display Error info", async () => {
    renderComponent();

    // Wait for the data to populate
    expect(await screen.findByRole("option", { name: "Test Venue" })).toBeInTheDocument();

    // Fill in Facility Name and Description, but leave Faulty Part empty
    fireEvent.change(screen.getByLabelText(/Facility Name/i), { target: { value: "fac_ID_1" } });
    fireEvent.change(screen.getByLabelText(/Issue Description/i), { target: { value: "The net is torn." } });

    // Click submit
    const submitBtn = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    // Expect the required faulty part error to pop up
    expect(await screen.findByText("Please select the faulty part before submitting.")).toBeInTheDocument();
  });

  it("Case_Reports_7: Let the 'Issue Description' empty, click 'Submit Ticket' - Display Error info", async () => {
    renderComponent();

    // Wait for the data to populate
    expect(await screen.findByRole("option", { name: "Test Venue" })).toBeInTheDocument();

    // Fill in Facility Name and Faulty Part, but leave Description empty
    fireEvent.change(screen.getByLabelText(/Facility Name/i), { target: { value: "fac_ID_1" } });
    fireEvent.change(screen.getByLabelText(/Faulty Part/i), { target: { value: "equipment" } });
    fireEvent.change(screen.getByLabelText(/Issue Description/i), { target: { value: "   " } }); // Spaces should be ignored

    // Click submit
    const submitBtn = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    // Expect the required description error to pop up
    expect(await screen.findByText("Issue description is required.")).toBeInTheDocument();
  });

  it("Case_Reports_9: The visual information check: pending report is listed", async () => {
    renderComponent();

    // Wait for the list to be rendered and find the "pending" status pill
    const pendingPills = await screen.findAllByText("pending");
    expect(pendingPills.length).toBeGreaterThan(0);
  });

  it("Case_Reports_10: The visual information check: resolved report is listed", async () => {
    renderComponent();

    // Wait for the list to be rendered and find the "resolved" status pill
    const resolvedPills = await screen.findAllByText("resolved");
    expect(resolvedPills.length).toBeGreaterThan(0);
  });

});