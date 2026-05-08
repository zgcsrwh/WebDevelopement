import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Facilities from "../src/pages/member/Facilities";
import * as bookingService from "../src/services/bookingService";
import {testViewFacility, clearCollection} from "./TestCommonFunc"


const renderComponent = () =>
    render(
      <BrowserRouter>
        <Facilities />
      </BrowserRouter>
);

//screen.logTestingPlaygroundURL();
describe("Facilities Filter Unit Test", () => {

    beforeEach(async () => {
        await testViewFacility();
    });

    afterEach(async () => {
        await clearCollection("facility");
        await clearCollection("time_slot");
    });


  it("Case_Facilities_1: The page display normal facilities information", async () => {

    renderComponent();

    // Wait for the facility card to render
    expect(await screen.findByText("Test Venue")).toBeInTheDocument();

    // Check details of one facility
    const basketballElements = await screen.findAllByText(/Basketball/i);
    expect(basketballElements.length).toBeGreaterThan(0);
    expect(basketballElements.length === 2);
    expect(basketballElements[0]).toBeInTheDocument();

    expect(screen.getByText("Capacity: 3")).toBeInTheDocument();
    
    const slot1 = screen.getAllByText(/06:00 - 07:00/i);
    expect(slot1.length === 2);

    const slot2 = screen.getAllByText(/07:00 - 08:00/i);
    expect(slot2.length === 2);
    
    const slot4 = screen.getAllByText(/09:00 - 10:00/i);
    expect(slot4.length === 1);

    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("Case_Facilities_2: The page display fixing facilities information", async () => {

    renderComponent();

    // Wait for the facility card to render
    expect(await screen.findByText("Fixing Venue")).toBeInTheDocument();

    // Check details of one facility
    const tennisElements = await screen.findAllByText(/Tennis/i);
    expect(tennisElements.length).toBeGreaterThan(0);
    expect(tennisElements.length === 2);
    expect(tennisElements[0]).toBeInTheDocument();

    screen.logTestingPlaygroundURL();
    expect(screen.getByText("Capacity: 6")).toBeInTheDocument();
    const testNum = screen.getAllByText("Fixing");
    expect(testNum.length === 3);
  });

  it("Case_Facilities_3: Apply the 'date' filter", async () => {
    renderComponent();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    // Change the date
    const dateInput = screen.getByLabelText(/Date/i);
    fireEvent.change(dateInput, { target: { value: tomorrowString } });
    
    expect(await screen.findByText("No available time slots for the selected date.")).toBeInTheDocument();
  });   

  it("Case_Facilities_4: Apply the 'Venue Type' filter", async () => {
    renderComponent();

    // Need to waite for the render completion of options
    await screen.findByRole("option", { name: "Tennis" });

    // Change Venue Type to Tennis
    const typeSelect = screen.getByLabelText(/Venue Type/i);
    fireEvent.change(typeSelect, { target: { value: "Tennis" } });

    // Check if only Tennis court is shown
    await waitFor(() => {
      expect(screen.queryByText("Fixing Venue")).toBeInTheDocument();
      expect(screen.queryByText("Test Venue")).not.toBeInTheDocument();
    });
  });

  it("Case_Facilities_5: Apply the 'Time Slot' filter", async () => {
    renderComponent();
    
    // Need to waite for the render completion of options
    await screen.findByRole("option", { name: "07:00 - 08:00" });

    // Wait for the time slot options to populate
    const timeSelect = screen.getByLabelText(/Time Slot/i);
    fireEvent.change(timeSelect, { target: { value: "07:00 - 08:00" } });

    // Check if only the facility with this slot is shown
    await waitFor(() => {
      expect(screen.queryByText("Test Venue")).toBeInTheDocument();
      expect(screen.queryByText("Fixing Venue")).not.toBeInTheDocument();
    });
  });

  it("Case_Facilities_6: Apply the 'Availability' filter", async () => {
    renderComponent();
  
    // Need to waite for the render completion of options
    await screen.findByRole("option", { name: "Normal" });

    // Change Availability to 'Fixing'
    const availabilitySelect = screen.getByLabelText(/Availability/i);
    fireEvent.change(availabilitySelect, { target: { value: "fixing" } });

    // Check if only the fixing facility is shown
    await waitFor(() => {
      expect(screen.queryByText("Fixing Venue")).toBeInTheDocument();
      expect(screen.queryByText("Test Venue")).not.toBeInTheDocument();
    });
  });

  it("Case_Facilities_7: Apply the filter first, then click 'Clear' button", async () => {
    renderComponent();

    // Apply a filter
    const typeSelect = screen.getByLabelText(/Venue Type/i);
    fireEvent.change(typeSelect, { target: { value: "Tennis" } });

    await waitFor(() => {
      expect(screen.queryByText("Test Venue")).not.toBeInTheDocument();
    });

    // Click Clear
    const clearBtn = screen.getByRole("button", { name: /Clear/i });
    fireEvent.click(clearBtn);

    // Verify the select resets and all data returns
    await waitFor(() => {
      expect(typeSelect.value).toBe("All");
      expect(screen.queryByText("Test Venue")).toBeInTheDocument();
    });
  });

});