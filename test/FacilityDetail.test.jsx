import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import Facilities from "../src/pages/member/Facilities";
import FacilityDetail from "../src/pages/member/FacilityDetail";
import * as bookingService from "../src/services/bookingService";
import {testViewFacility, clearCollection} from "./TestCommonFunc"

const renderComponent = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Facilities />} />
          <Route path="/member/facilities/:id" element={<FacilityDetail />} />
          <Route path="/member/facility-detail/:id" element={<FacilityDetail />} />
          <Route path="/member/facility/:id" element={<FacilityDetail />} />
          <Route path="/facilities/:id" element={<FacilityDetail />} />
          <Route path="/:param1/:id" element={<FacilityDetail />} />
          <Route path="/:param1/:param2/:id" element={<FacilityDetail />} />
        </Routes>
      </MemoryRouter>
);

// The testing functions are designed to be go through from facilities page

describe("Facilities Filter Unit Test", () => {

    beforeEach(async () => {
        await testViewFacility();
    });

    afterEach(async () => {
        await clearCollection("facility");
        await clearCollection("time_slot");
    });

  it("Case_FacilityDetail_1: Click 'View Details' to navigate to a normal facility detail page", async () => {
 
    renderComponent();

    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();

    // Filter out the normal venue
    const availabilitySelect = screen.getByLabelText(/Availability/i);
    fireEvent.change(availabilitySelect, { target: { value: "normal" } });

    // Click apply
    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.queryByText("Fixing Venue")).not.toBeInTheDocument();
    });

    // wait for link navigation
    const viewDetailsLinks = await screen.findAllByRole("link", { name: /View Details/i });
    fireEvent.click(viewDetailsLinks[0]);

    expect(await screen.findByText("Usage guidelines")).toBeInTheDocument();

    expect(screen.getByText(/Max 3 attendees/i)).toBeInTheDocument();
    expect(screen.getByText(/06:00 - 10:00/i)).toBeInTheDocument();
    expect(screen.getByText(/My Test Location/i)).toBeInTheDocument();

    // Find the booked time slot
    const timeNode = screen.getByText(/08:00 - 09:00/i);
    expect(timeNode.parentElement).toHaveTextContent(/Booked/i);

    expect(screen.getByRole('link', { name: /book/i })).toBeInTheDocument();
  });

  it("Case_FacilityDetail_2: Click 'View Details' to navigate to a fixing facility detail page", async () => {
 
    renderComponent();

    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();

    // Filter out the normal venue
    const availabilitySelect = screen.getByLabelText(/Availability/i);
    fireEvent.change(availabilitySelect, { target: { value: "fixing" } });

    // Click apply
    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.queryByText("Test Venue")).not.toBeInTheDocument();
    });

    // wait for link navigation
    const viewDetailsLinks = await screen.findAllByRole("link", { name: /View Details/i });
    fireEvent.click(viewDetailsLinks[0]);

    expect(await screen.findByText("Usage guidelines")).toBeInTheDocument();

    expect(screen.getByText(/Max 6 attendees/i)).toBeInTheDocument();
    expect(screen.getByText(/12:00 - 14:00/i)).toBeInTheDocument();
    expect(screen.getByText(/My Test Location/i)).toBeInTheDocument();
    expect(screen.getByText(/This facility is currently not available for booking./i)).toBeInTheDocument();

    
    expect(screen.queryByRole('link', { name: /book/i })).not.toBeInTheDocument();
  });

  it("Case_FacilityDetail_3: Select a different date", async () => {
 
    renderComponent();
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();

    // Filter out the normal venue
    const availabilitySelect = screen.getByLabelText(/Availability/i);
    fireEvent.change(availabilitySelect, { target: { value: "normal" } });

    // Click apply
    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.queryByText("Fixing Venue")).not.toBeInTheDocument();
    });

    // wait for link navigation
    const viewDetailsLinks = await screen.findAllByRole("link", { name: /View Details/i });
    fireEvent.click(viewDetailsLinks[0]);

    expect(await screen.findByText("Usage guidelines")).toBeInTheDocument();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    // Change the date
    const dateInput = screen.getByLabelText(/Date/i);
    fireEvent.change(dateInput, { target: { value: tomorrowString } });

    expect(await screen.findByText("Usage guidelines")).toBeInTheDocument();
 
    // Tomorrow's slots are designed to be all booked
    expect(screen.queryByRole('link', { name: /book/i })).not.toBeInTheDocument();
  });

});
