
import { Country, State, City } from 'country-state-city';

export const getCountries = () => {
    return Country.getAllCountries().map((country) => country.name);
};

export const getStates = (countryName: string) => {
    const country = Country.getAllCountries().find((c) => c.name === countryName);
    if (!country) return [];
    return State.getStatesOfCountry(country.isoCode).map((state) => state.name);
};

export const getCities = (countryName: string, stateName: string) => {
    const country = Country.getAllCountries().find((c) => c.name === countryName);
    if (!country) return [];

    // Find state by name (careful with different formats "Tamil Nadu" vs "TamilNadu", library is standard)
    const state = State.getStatesOfCountry(country.isoCode).find((s) => s.name === stateName);
    if (!state) return [];

    return City.getCitiesOfState(country.isoCode, state.isoCode).map((city) => city.name);
};
